import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createElement, type ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "node:stream";
import Medusa from "@medusajs/js-sdk";
import type { SellerMemberDTO } from "@mercurjs/types";
import { vendorOperations, type AuthorizedVendor } from "./operations";
import { formatDate, formatMoney, listInput } from "./presentation";
import { resourceId, stockQuantity } from "./validation";
import { sellerApplicationUrl } from "../../lib/storefront-url";
import { safeRedirectPath } from "../../lib/auth-utils";
import { offerConfiguration } from "../offers/data";

function productReadHarness(respond: (path: string) => Promise<unknown>) {
  const exports = {} as typeof import("./data");
  const nativeRequire = createRequire(import.meta.url);
  const calls: string[] = [];
  const sdk = new Medusa({ baseUrl: "https://api.example.invalid", auth: { type: "jwt", jwtTokenStorageMethod: "nostore" } });
  sdk.client.fetch = async <T>(path: Parameters<Medusa["client"]["fetch"]>[0], init?: Parameters<Medusa["client"]["fetch"]>[1]) => {
    calls.push(String(path));
    assert.equal(init?.headers && (init.headers as Record<string, string>)["x-seller-id"], "seller_current");
    assert.equal(init?.cache, "no-store");
    return await respond(String(path)) as T;
  };
  const membership = { seller: { id: "seller_current", status: "open" }, member: { is_active: true } } as SellerMemberDTO;
  runInNewContext(ts.transpileModule(readFileSync(new URL("./data.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require: (id: string) => {
      if (id === "server-only") return {};
      if (id === "@/lib/auth-sdk") return {
        createVendorSdk: () => sdk,
        getVendorToken: async () => "test-token",
        getVendorContext: async () => ({ status: "authenticated", membership }),
      };
      return nativeRequire(id);
    },
  });
  return { calls, detail: exports.productDetail, configuration: async () => offerConfiguration((await exports.workspace()).client) };
}

describe("parallel vendor detail reads", () => {
  it("starts detail, axes, profiles and warehouse without a visibility preflight or read waterfall", async () => {
    const release = Promise.withResolvers<void>();
    const h = productReadHarness(async (path) => {
      await release.promise;
      return path.endsWith("catalog-options") ? { options: [], variants: [{ id: "variant_1" }] }
        : path === "/vendor/products/prod_1" ? { product: { id: "prod_1", title: "Product" } }
          : path === "/vendor/stock-locations" ? { count: 1, stock_locations: [{ id: "loc_1" }] }
            : { count: 1, shipping_profiles: [{ id: "profile_1" }] };
    });
    const detail = h.detail("prod_1");
    const configuration = h.configuration();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual([...h.calls].sort(), ["/vendor/products/prod_1", "/vendor/products/prod_1/catalog-options", "/vendor/shipping-profiles", "/vendor/stock-locations"].sort());
    release.resolve();
    const [result] = await Promise.all([detail, configuration]);
    assert.equal(result.product.id, "prod_1");
    assert.equal(result.product.variants?.[0].id, "variant_1");
  });

  it("propagates API visibility denial without a fallback read and rejects malformed IDs before HTTP", async () => {
    const denied = new Error("Product not visible");
    const h = productReadHarness(async () => { throw denied; });
    await assert.rejects(h.detail("prod_1"), (error) => error === denied);
    assert.equal(h.calls.length, 2);
    await assert.rejects(h.detail("../foreign"), /identificador/);
    assert.equal(h.calls.length, 2);
  });
});

it("streams the dashboard shell and each metric without waiting for other services", async () => {
  const nativeRequire = createRequire(import.meta.url);
  const pending = new Map<string, ReturnType<typeof Promise.withResolvers<unknown>>>();
  const exports = {} as { default: () => Promise<ReactNode> };
  runInNewContext(ts.transpileModule(readFileSync(new URL("../../app/seller/(workspace)/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports,
    require: (id: string) => {
      if (id === "next/link") return { default: "a" };
      if (id === "@/components/ui/card") return { Card: "section", CardHeader: "header", CardContent: "div", CardTitle: "h2" };
      if (id === "@/components/vendor/recent-orders") return { RecentOrders: () => "Orders resolved" };
      if (id === "@/features/workspace/components") return { PageHeading: ({ title }: { title: string }) => createElement("h1", {}, title) };
      if (id === "@/features/workspace/data") return {
        ORDER_LIST_FIELDS: "id",
        resultOf: async (request: Promise<unknown>) => ({ data: await request }),
        workspace: async () => ({
          membership: { member: { first_name: "Daniel" }, seller: { name: "Store" } },
          client: { get: (path: string) => { const request = Promise.withResolvers<unknown>(); pending.set(path, request); return request.promise; } },
        }),
      };
      return nativeRequire(id);
    },
  });
  const tree = await exports.default();
  assert.equal(pending.size, 4, "independent data loads start together and orders are shared");
  let html = "";
  const sink = new PassThrough();
  sink.on("data", (chunk: Buffer) => { html += chunk.toString(); });
  const ready = Promise.withResolvers<void>();
  const complete = Promise.withResolvers<void>();
  const stream = renderToPipeableStream(tree, {
    onShellReady() { stream.pipe(sink); ready.resolve(); },
    onAllReady() { complete.resolve(); },
    onError(error) { ready.reject(error); complete.reject(error); },
  });
  try {
    await ready.promise;
    assert.match(html, /Hola, Daniel/);
    assert.match(html, /Cargando total/);
    assert.match(html, /Preparación de la tienda/);
    pending.get("/vendor/products")!.resolve({ count: 17 });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.match(html, />17</);
    assert.doesNotMatch(html, /Orders resolved/);
    pending.get("/vendor/orders")!.resolve({ count: 0, orders: [] });
    pending.get("/vendor/inventory-items")!.resolve({ count: 0 });
    pending.get("/vendor/onboarding")!.resolve({ checks: [] });
    await complete.promise;
  } finally {
    stream.abort();
  }
});

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function harness(
  options: {
    active?: boolean;
    status?: string;
    respond?: (path: string) => unknown;
  } = {},
) {
  const calls: {
    path: string;
    init: Parameters<Medusa["client"]["fetch"]>[1];
  }[] = [];
  const sdk = new Medusa({
    baseUrl: "https://api.example.invalid",
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
  });
  sdk.client.fetch = async <T>(
    path: Parameters<Medusa["client"]["fetch"]>[0],
    init?: Parameters<Medusa["client"]["fetch"]>[1],
  ): Promise<T> => {
    calls.push({ path: String(path), init });
    return (options.respond?.(String(path)) ?? {}) as T;
  };
  const membership = {
    seller: { id: "seller_current", status: options.status ?? "open" },
    member: { id: "member_current", is_active: options.active ?? true },
  } as SellerMemberDTO;
  let authorizations = 0;
  const authorize = async (): Promise<AuthorizedVendor> => {
    authorizations += 1;
    return { sdk, membership };
  };
  return {
    calls,
    operations: vendorOperations(authorize),
    authorizations: () => authorizations,
  };
}

describe("vendor mutation authorization", () => {
  for (const state of [
    { active: false },
    { status: "pending_approval" },
    { status: "suspended" },
    { status: "terminated" },
    { status: "unknown" },
  ]) {
    it(`rejects every mutation before a request when ${JSON.stringify(state)}`, async () => {
      const context = harness(state);
      for (const operation of Object.values(context.operations))
        await assert.rejects(operation(new FormData()), /membresía|tienda/);
      assert.equal(
        context.authorizations(),
        Object.keys(context.operations).length,
      );
      assert.equal(context.calls.length, 0);
    });
  }

  it("checks authorization again on each mutation and pins the server-selected seller", async () => {
    const context = harness();
    const payload = form({
      name: "My store",
      email: "owner@example.com",
      seller_id: "seller_other",
    });
    await context.operations.updateProfile(payload);
    await context.operations.updateProfile(payload);
    assert.equal(context.authorizations(), 2);
    for (const call of context.calls) {
      assert.deepEqual(call.init?.headers, { "x-seller-id": "seller_current" });
      assert.equal(call.init?.cache, "no-store");
      assert.equal(typeof call.init?.body, "object");
      assert.ok(!JSON.stringify(call.init?.body).includes("seller_other"));
    }
  });
});

describe("product moderation", () => {
  it("allows only proposed creation, never client-requested publication", async () => {
    const context = harness();
    await assert.rejects(
      context.operations.createProduct(
        form({ title: "Product", status: "published" }),
      ),
      /aprobación/,
    );
    await assert.rejects(
      context.operations.createProduct(
        form({ title: "Product", status: "draft" }),
      ),
      /aprobación/,
    );
    assert.equal(context.calls.length, 0);
    await context.operations.createProduct(
      form({ title: "Product", status: "proposed", categories_present: "true", axes: "[]", variants: JSON.stringify([{ title: "Unique", sku: "MASTER-1", options: {} }]) }),
    );
    assert.deepEqual(context.calls[0].init?.body, {
      title: "Product",
      subtitle: "",
      description: "",
      status: "proposed",
      attributes: [],
      images: [],
      categories: [],
      variants: [{ title: "Unique", sku: "MASTER-1", options: {} }],
    });
  });

  it("propagates the backend visibility denial without retrying or preflight reads", async () => {
    const denied = Object.assign(new Error("Product not available"), { status: 403 });
    const context = harness({ respond: () => { throw denied; } });
    await assert.rejects(
      context.operations.editProduct(
        form({ id: "prod_other", title: "Product" }),
      ),
      (error) => error === denied,
    );
    assert.equal(context.calls.length, 1);
    assert.equal(context.calls[0].init?.method, "POST");
  });

  it("preserves a native pending product_change response instead of reporting a live product", async () => {
    const change = { id: "change_1", status: "pending" };
    const context = harness({
      respond: () => ({ product_change: change }),
    });
    const response = await context.operations.editProduct(
      form({ id: "prod_1", title: "New title" }),
    );
    assert.deepEqual(response, { product_change: change });
    assert.equal(context.calls.length, 1);
    assert.equal(context.calls[0].path, "/vendor/products/prod_1");
    assert.equal(context.calls[0].init?.method, "POST");
  });
});

describe("stock adjustments", () => {
  const payload = {
    id: "item_1",
    location_id: "loc_1",
    expected_quantity: "10",
    stocked_quantity: "12",
  };
  it("submits the original count to the atomic backend operation without a racy preflight read", async () => {
    const context = harness();
    await context.operations.updateStock(form(payload));
    assert.equal(context.calls.length, 1);
    assert.equal(context.calls[0].path, "/vendor/inventory-adjustments");
    assert.equal(context.calls[0].init?.method, "POST");
    assert.deepEqual(context.calls[0].init?.body, {
      inventory_item_id: "item_1", location_id: "loc_1",
      expected_quantity: 10, stocked_quantity: 12,
    });
  });

  it("propagates backend conflicts and scope failures without retrying an absolute write", async () => {
    for (const status of [409, 403, 404]) {
      const failure = Object.assign(new Error("Inventory update rejected"), { status });
      const context = harness({ respond: () => { throw failure; } });
      await assert.rejects(context.operations.updateStock(form(payload)), error => error === failure);
      assert.equal(context.calls.length, 1);
      assert.equal(context.calls[0].path, "/vendor/inventory-adjustments");
    }
  });

  it("rejects negative, fractional, empty, infinite and unsafe counts", () => {
    for (const quantity of [
      "-1",
      "1.5",
      "",
      "Infinity",
      "9007199254740992",
      "1e5",
    ])
      assert.throws(() => stockQuantity(quantity));
    assert.equal(stockQuantity("0"), 0);
  });
});

describe("seller profile and location operations", () => {
  it("rejects countries outside the approved US market without writes", async () => {
    const context = harness();
    for (const operation of [
      context.operations.updateAddress,
    ]) {
      await assert.rejects(
        operation(form({ name: "Location", country_code: "uy" })),
        /Estados Unidos/,
      );
    }
    assert.equal(context.calls.length, 0);
  });
  it("uses current seller for company/address routes and ignores submitted scope", async () => {
    const context = harness();
    await context.operations.updateCompany(
      form({ corporate_name: "Company", seller_id: "seller_other" }),
    );
    await context.operations.updateAddress(
      form({
        address_1: "Street",
        city: "City",
        country_code: "US",
        postal_code: "10000",
        seller_id: "seller_other",
      }),
    );
    assert.equal(
      context.calls[0].path,
      "/vendor/sellers/seller_current/professional-details",
    );
    assert.deepEqual(context.calls[0].init?.body, {
      corporate_name: "Company",
    });
    assert.equal(
      context.calls[1].path,
      "/vendor/sellers/seller_current/address",
    );
  });

  it("rejects free warehouse creation without writes even with a valid US address", async () => {
    const context = harness();
    await assert.rejects(context.operations.createLocation(
      form({
        name: "Warehouse",
        address_1: "Street",
        city: "City",
        country_code: "US",
        postal_code: "10000",
      }),
    ), /solicitud aprobada/);
    assert.equal(context.authorizations(), 1);
    assert.equal(context.calls.length, 0);
  });

  it("rejects invalid email and unsafe website URLs", async () => {
    const context = harness();
    await assert.rejects(
      context.operations.updateProfile(
        form({ name: "Store", email: "invalid" }),
      ),
    );
    await assert.rejects(
      context.operations.updateProfile(
        form({
          name: "Store",
          email: "owner@example.com",
          website_url: "javascript:alert(1)",
        }),
      ),
    );
    assert.equal(context.calls.length, 0);
  });
});

describe("presentation and navigation", () => {
  it("preserves the existing display zone and rejects impossible ISO dates", () => {
    for (const value of [undefined, "", "invalid", "2026-02-30T12:00:00Z", new Date(NaN)])
      assert.equal(formatDate(value), "—");
    assert.equal(formatDate("2026-09-04T01:00:00Z"), "3 set. 2026");
    const date = new Date("2026-09-03T22:00:00-03:00");
    assert.equal(formatDate(date), formatDate("2026-09-04T01:00:00Z"));
    assert.equal(date.toISOString(), "2026-09-04T01:00:00.000Z");
  });

  it("formats Medusa amounts in display units, including serialized decimal strings", () => {
    assert.equal(
      formatMoney(49.99, "USD"),
      new Intl.NumberFormat("es-UY", {
        style: "currency",
        currency: "USD",
      }).format(49.99),
    );
    assert.equal(formatMoney("49.99", "USD"), formatMoney(49.99, "USD"));
    for (const value of [undefined, null, "", NaN, Infinity])
      assert.equal(formatMoney(value, "USD"), "No disponible");
  });

  it("bounds query pagination and validates path IDs", () => {
    assert.equal(listInput({ page: "2" }).offset, 20);
    for (const page of ["0", "-1", "1.5", "Infinity", "9007199254740992"])
      assert.equal(listInput({ page }).page, 1);
    assert.equal(listInput({ q: "x".repeat(500) }).q.length, 200);
    for (const id of ["../seller", "id?other=1", "id/route", ""])
      assert.throws(() => resourceId(id));
  });

  it("never builds token-bearing or unsafe application links and defaults locally only", () => {
    assert.equal(
      sellerApplicationUrl(undefined, false),
      "http://localhost:3000/account/sell",
    );
    assert.equal(sellerApplicationUrl(undefined, true), null);
    assert.equal(
      sellerApplicationUrl("https://shop.example.com/", true),
      "https://shop.example.com/account/sell",
    );
    for (const url of [
      "https://u:p@shop.example.com",
      "https://shop.example.com/?token=secret",
      "javascript:alert(1)",
      "//evil.example",
      "http://shop.example.com",
    ])
      assert.equal(sellerApplicationUrl(url, true), null);
    assert.equal(safeRedirectPath("/seller/status", "/seller"), "/seller");
  });
});
