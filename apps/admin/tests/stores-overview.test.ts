import assert from "node:assert/strict";
import test from "node:test";
import Medusa from "@medusajs/js-sdk";
import { listStores, retrieveStore } from "../src/features/stores/data";
import {
  isStoreId,
  parseStoreFilters,
  storeListHref,
} from "../src/features/stores/helpers";
import { readOverviewCount } from "../src/features/overview/metrics";

test("store filters reject malformed pagination and unsupported status", () => {
  for (const offset of ["-1", "1.5", "Infinity", "NaN"]) {
    assert.equal(parseStoreFilters({ offset }).offset, 0);
  }
  assert.deepEqual(
    parseStoreFilters({ status: "active", q: ["bad"], offset: ["20"] }),
    { status: "all", q: "", offset: 0, limit: 20 },
  );
  assert.equal(parseStoreFilters({ q: " x ", status: "suspended" }).q, "x");
  assert.equal(parseStoreFilters({ offset: "9000000" }).offset, 1_000_000);
  assert.equal(isStoreId("../sellers"), false);
  assert.equal(isStoreId("sel_123"), true);
});

test("pagination preserves native filters and safely encodes search", () => {
  const filters = parseStoreFilters({ q: "A&B", status: "open" });
  const url = new URL(storeListHref(filters, 20), "https://admin.example");
  assert.equal(url.pathname, "/dashboard/stores");
  assert.equal(url.searchParams.get("q"), "A&B");
  assert.equal(url.searchParams.get("status"), "open");
  assert.equal(url.searchParams.get("offset"), "20");
});

test("store reads forward server pagination and avoid payment and assumed readiness fields", async () => {
  const calls: Array<{
    path: string;
    options: { query: Record<string, unknown>; cache: string };
  }> = [];
  const sdk = {
    client: {
      fetch: async (
        path: string,
        options: (typeof calls)[number]["options"],
      ) => {
        calls.push({ path, options });
        return { sellers: [], count: 123, offset: 20, limit: 20 };
      },
    },
  } as unknown as Medusa;
  const result = await listStores(
    sdk,
    parseStoreFilters({ status: "open", offset: "20", q: "Shop" }),
  );
  assert.equal(result.count, 123);
  assert.equal(calls[0].path, "/admin/sellers");
  assert.equal(calls[0].options.query.status, "open");
  assert.equal(calls[0].options.query.offset, 20);
  assert.equal(calls[0].options.query.q, "Shop");
  await retrieveStore(sdk, "sel_123");
  assert.equal(calls[1].path, "/admin/sellers/sel_123");
  assert.equal(calls[1].options.cache, "no-store");
  assert.match(String(calls[1].options.query.fields), /professional_details/);
  assert.doesNotMatch(
    String(calls[1].options.query.fields),
    /payment|payout|readiness/,
  );
});

test("overview uses backend counts including zero and distinct native review filters", async () => {
  const calls: unknown[] = [];
  const sdk = {
    client: {
      fetch: async (path: string, options: unknown) => {
        calls.push([path, options]);
        return { count: 0 };
      },
    },
    admin: {
      product: {
        list: async (query: unknown) => {
          calls.push(query);
          return { count: 42 };
        },
      },
      order: { list: async () => ({ count: 75 }) },
    },
  } as unknown as Medusa;
  assert.equal(await readOverviewCount(sdk, "applications"), 0);
  assert.equal(await readOverviewCount(sdk, "products"), 42);
  assert.equal(await readOverviewCount(sdk, "stores"), 0);
  assert.equal(await readOverviewCount(sdk, "orders"), 75);
  assert.deepEqual(calls[0], [
    "/admin/vendor-applications",
    { query: { limit: 1, offset: 0, status: "submitted" }, cache: "no-store" },
  ]);
  assert.deepEqual(calls[1], {
    limit: 1,
    offset: 0,
    fields: "id",
    status: ["proposed"],
  });
});

test("read failures propagate instead of becoming fabricated zero counts", async () => {
  const error = new Error("Service unavailable");
  const sdk = {
    client: {
      fetch: async () => {
        throw error;
      },
    },
  } as unknown as Medusa;
  await assert.rejects(readOverviewCount(sdk, "stores"), error);
  await assert.rejects(listStores(sdk, parseStoreFilters({})), error);
});

test("native SDK preserves authentication and encodes read-only directory requests", async (t) => {
  const requests: { url: URL; init?: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), init });
      return Response.json({ sellers: [], count: 0, offset: 20, limit: 20 });
    },
  );
  const sdk = new Medusa({
    baseUrl: "https://backend.invalid",
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
    globalHeaders: { Authorization: "Bearer test-only" },
  });
  await listStores(
    sdk,
    parseStoreFilters({ q: "A&B", status: "suspended", offset: "20" }),
  );
  const request = requests[0];
  assert.equal(request.url.pathname, "/admin/sellers");
  assert.equal(request.url.searchParams.get("q"), "A&B");
  assert.equal(request.url.searchParams.get("status"), "suspended");
  assert.equal(request.url.searchParams.get("offset"), "20");
  assert.equal(request.init?.method ?? "GET", "GET");
  assert.equal(request.init?.cache, "no-store");
  assert.equal(
    new Headers(request.init?.headers).get("authorization"),
    "Bearer test-only",
  );
});
