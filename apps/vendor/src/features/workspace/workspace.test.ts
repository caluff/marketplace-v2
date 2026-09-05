import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Medusa from "@medusajs/js-sdk";
import type { SellerMemberDTO } from "@mercurjs/types";
import { vendorOperations, type AuthorizedVendor } from "./operations";
import { formatMoney, listInput } from "./presentation";
import { resourceId, stockQuantity } from "./validation";
import { sellerApplicationUrl } from "../../lib/storefront-url";
import { safeRedirectPath } from "../../lib/auth-utils";

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
      form({ title: "Product", status: "proposed" }),
    );
    assert.deepEqual(context.calls[0].init?.body, {
      title: "Product",
      subtitle: "",
      description: "",
      status: "proposed",
    });
  });

  it("rejects inaccessible product IDs before staging changes", async () => {
    const context = harness({ respond: () => ({ products: [] }) });
    await assert.rejects(
      context.operations.editProduct(
        form({ id: "prod_other", title: "Product" }),
      ),
      /no está disponible/,
    );
    assert.equal(context.calls.length, 1);
    assert.equal(context.calls[0].init?.method, undefined);
  });

  it("preserves a native pending product_change response instead of reporting a live product", async () => {
    const change = { id: "change_1", status: "pending" };
    const context = harness({
      respond: (path) =>
        path === "/vendor/products"
          ? { products: [{ id: "prod_1" }] }
          : { product_change: change },
    });
    const response = await context.operations.editProduct(
      form({ id: "prod_1", title: "New title" }),
    );
    assert.deepEqual(response, { product_change: change });
    assert.equal(context.calls[1].path, "/vendor/products/prod_1");
    assert.equal(context.calls[1].init?.method, "POST");
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
      context.operations.createLocation,
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

  it("creates only the requested stock location, without shipping configuration", async () => {
    const context = harness();
    await context.operations.createLocation(
      form({
        name: "Warehouse",
        address_1: "Street",
        city: "City",
        country_code: "US",
        postal_code: "10000",
      }),
    );
    assert.equal(context.calls.length, 1);
    assert.equal(context.calls[0].path, "/vendor/stock-locations");
    assert.deepEqual(context.calls[0].init?.body, {
      name: "Warehouse",
      address: {
        address_1: "Street",
        city: "City",
        country_code: "us",
        postal_code: "10000",
      },
    });
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
