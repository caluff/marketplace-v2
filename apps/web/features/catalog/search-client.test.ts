import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { requestProductSearch, requestSearchRegion } from "../search/client";
import { parseSearchParameters } from "../search/parameters";

const TEST_KEY = `pk_${"b".repeat(64)}`;

function configure(context: TestContext) {
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL;
  const key = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = "https://commerce.example.com";
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = TEST_KEY;
  context.after(() => {
    if (backend === undefined)
      delete process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL;
    else process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = backend;
    if (key === undefined)
      delete process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = key;
  });
}

test("product search uses native SDK headers, one serialized body and regional display-unit filters", async (context) => {
  configure(context);
  context.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init: RequestInit) => {
      assert.match(String(input), /\/store\/products\/search$/);
      assert.equal(init.method, "POST");
      assert.equal(
        new Headers(init.headers).get("x-publishable-api-key"),
        TEST_KEY,
      );
      assert.equal(init.cache, "no-store");
      assert.deepEqual(JSON.parse(String(init.body)), {
        query: "mesa",
        page: 1,
        hitsPerPage: 24,
        category_ids: ["pcat_a"],
        seller_ids: ["sel_a", "sel_b"],
        min_price: 12.5,
        max_price: 70,
        sort: "price_asc",
        region_id: "reg_us",
        country_code: "us",
      });
      return Response.json({
        products: [],
        nbHits: 0,
        nbPages: 0,
        page: 1,
        hitsPerPage: 24,
        facets: { categories: [], sellers: [] },
        price_range: null,
        query: "mesa",
      });
    },
  );
  const result = await requestProductSearch(
    parseSearchParameters({
      q: "mesa",
      page: "2",
      category_id: "pcat_a",
      seller_id: ["sel_a", "sel_b"],
      min_price: "12.50",
      max_price: "70",
      sort: "price_asc",
    }),
    "reg_us",
    new AbortController().signal,
  );
  assert.equal(result.nbHits, 0);
});

test("search region is obtained from Medusa instead of inventing a region ID", async (context) => {
  configure(context);
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({
      regions: [
        { id: "reg_eu", currency_code: "eur", countries: [{ iso_2: "de" }] },
        { id: "reg_us", currency_code: "usd", countries: [{ iso_2: "us" }] },
      ],
    }),
  );
  assert.equal(
    await requestSearchRegion(new AbortController().signal),
    "reg_us",
  );
});

test("cancelled suggestions never launch another search request", async (context) => {
  configure(context);
  let calls = 0;
  context.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({});
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    requestProductSearch(
      parseSearchParameters({ q: "mesa" }),
      "reg_us",
      controller.signal,
      6,
    ),
  );
  assert.equal(calls, 0);
});
