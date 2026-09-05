import assert from "node:assert/strict";
import test from "node:test";
import Medusa from "@medusajs/js-sdk";
import type { DraftData } from "@marketplace-v2/vendor-onboarding-contracts";
import {
  canCreateProposedCategory,
  createCatalogCategory,
  parseCategoryProposalInput,
} from "../src/features/vendor-applications/category-proposal";

function form(name = "Cerámica artesanal", version = "3") {
  const data = new FormData();
  data.set("name", name);
  data.set("expected_version", version);
  return data;
}

test("category input creates stable native handles and validates submitted values", () => {
  assert.deepEqual(parseCategoryProposalInput(form("  Cerámica artesanal  ")), {
    name: "Cerámica artesanal",
    handle: "ceramica-artesanal",
    version: 3,
  });
  for (const name of ["", "  ", "x".repeat(121), "Artes\nObjetos", "!!!"])
    assert.equal(parseCategoryProposalInput(form(name)), null);
  for (const version of ["", "0", "-1", "1.5", "9007199254740992"])
    assert.equal(parseCategoryProposalInput(form("Arte", version)), null);
});

test("only the current submitted snapshot can authorize a proposal creation", () => {
  const snapshot: DraftData = {
    responsible: {
      first_name: "Alex",
      last_name: "Rivera",
      phone: "+12025550123",
    },
    store: {
      name: "Tienda",
      handle: "tienda",
      description: "Arte",
      website_url: "",
    },
    activity: {
      business_type: "individual",
      company_name: "",
      currency_code: "usd",
      category_ids: [],
      category_suggestion: "Cerámica",
      description: "Arte",
      business_address: {
        address_1: "123 Main",
        address_2: "",
        city: "Miami",
        province: "FL",
        postal_code: "33101",
        country_code: "us",
      },
    },
  };
  assert.equal(
    canCreateProposedCategory({ version: 3, submitted_data: snapshot }, 3),
    true,
  );
  assert.equal(
    canCreateProposedCategory({ version: 3, submitted_data: snapshot }, 2),
    false,
  );
  assert.equal(
    canCreateProposedCategory({ version: 3, submitted_data: null }, 3),
    false,
  );
  delete snapshot.activity.category_suggestion;
  assert.equal(
    canCreateProposedCategory({ version: 3, submitted_data: snapshot }, 3),
    false,
  );
});

function sdk() {
  return new Medusa({
    baseUrl: "http://category-backend.invalid",
    debug: false,
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
    globalHeaders: { Authorization: "Bearer admin-test-token" },
  });
}

test("native SDK creates an explicitly public active category with authenticated headers", async (t) => {
  const calls: { path: string; method: string; body: unknown }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer admin-test-token");
      const method = init?.method ?? "GET";
      calls.push({
        path: url.pathname,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (method === "GET") {
        assert.equal(url.searchParams.get("handle"), "ceramica-artesanal");
        assert.equal(url.searchParams.get("limit"), "1");
        return Response.json({
          product_categories: [],
          count: 0,
          offset: 0,
          limit: 1,
        });
      }
      return Response.json({ product_category: { id: "pcat_test" } });
    },
  );
  assert.deepEqual(
    await createCatalogCategory(sdk().admin.productCategory, {
      name: "Cerámica artesanal",
      handle: "ceramica-artesanal",
    }),
    { created: true },
  );
  assert.deepEqual(calls, [
    { path: "/admin/product-categories", method: "GET", body: null },
    {
      path: "/admin/product-categories",
      method: "POST",
      body: {
        name: "Cerámica artesanal",
        handle: "ceramica-artesanal",
        is_active: true,
        is_internal: false,
      },
    },
  ]);
});

test("existing handles avoid duplicate writes and never activate or rename another category", async (t) => {
  let count = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init?: RequestInit) => {
      count++;
      assert.equal(init?.method ?? "GET", "GET");
      return Response.json({
        product_categories: [{ id: "pcat_existing", is_active: false }],
        count: 1,
        offset: 0,
        limit: 1,
      });
    },
  );
  assert.deepEqual(
    await createCatalogCategory(sdk().admin.productCategory, {
      name: "Arte",
      handle: "arte",
    }),
    { created: false },
  );
  assert.equal(count, 1);
});

test("native handle conflict is safe and service failures never report a successful create", async (t) => {
  for (const status of [409, 403, 503]) {
    await t.test(`HTTP ${status}`, async (subtest) => {
      subtest.mock.method(
        globalThis,
        "fetch",
        async (_input: unknown, init?: RequestInit) =>
          (init?.method ?? "GET") === "GET"
            ? Response.json({
                product_categories: [],
                count: 0,
                offset: 0,
                limit: 1,
              })
            : Response.json({ message: "Operation rejected" }, { status }),
      );
      const operation = createCatalogCategory(sdk().admin.productCategory, {
        name: "Arte",
        handle: "arte",
      });
      if (status === 409) assert.deepEqual(await operation, { created: false });
      else await assert.rejects(operation);
    });
  }
});
