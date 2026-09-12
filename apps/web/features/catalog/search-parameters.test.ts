import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSearchFilters,
  parseSearchParameters,
  searchHref,
} from "../search/parameters";
import {
  getPriceSliderBounds,
  getPriceSliderValue,
} from "../search/price-range";

test("search URL preserves repeated facets, query, prices and sort across reloads", () => {
  const parameters = parseSearchParameters({
    q: "  mesa   azul  ",
    category_id: ["pcat_one", "pcat_two", "pcat_one"],
    seller_id: "sel_one",
    min_price: "0",
    max_price: "24.99",
    sort: "price_asc",
    page: "3",
  });
  const url = new URL(searchHref(parameters), "https://store.example");
  assert.equal(parameters.q, "mesa azul");
  assert.deepEqual(url.searchParams.getAll("category_id"), [
    "pcat_one",
    "pcat_two",
  ]);
  assert.equal(url.searchParams.get("min_price"), "0");
  assert.equal(url.searchParams.get("max_price"), "24.99");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("sort"), "price_asc");
});

test("search URL rejects malformed filters and bounds input", () => {
  const parameters = parseSearchParameters({
    q: "a".repeat(300),
    category_id: ["valid", "foo OR status:published", "../bad"],
    min_price: "-1",
    max_price: "Infinity",
    page: "1.5",
    sort: "secret",
  });
  assert.equal(parameters.q.length, 200);
  assert.deepEqual(parameters.categoryIds, ["valid"]);
  assert.equal(parameters.minPrice, undefined);
  assert.equal(parameters.maxPrice, undefined);
  assert.equal(parameters.page, 1);
  assert.equal(parameters.sort, "relevance");
  assert.equal(parseSearchParameters({ page: "90000" }).page, 1000);
});

test("price intervals normalize without converting Medusa display units", () => {
  const parameters = parseSearchParameters({
    min_price: "70.50",
    max_price: "20",
  });
  assert.equal(parameters.minPrice, 20);
  assert.equal(parameters.maxPrice, 70.5);
});

test("price slider uses catalog bounds and keeps selected values reachable", () => {
  const bounds = getPriceSliderBounds(
    { min: 19.99, max: 80.01 },
    10,
    100,
  );

  assert.deepEqual(bounds, { min: 10, max: 100 });
  assert.deepEqual(getPriceSliderValue("25.50", "", bounds!), [25.5, 100]);
  assert.deepEqual(getPriceSliderValue("90", "30", bounds!), [30, 90]);
});

test("price slider remains available for a catalog with a single price", () => {
  const bounds = getPriceSliderBounds({ min: 200, max: 200 });
  assert.deepEqual(bounds, { min: 0, max: 200 });
  assert.deepEqual(getPriceSliderValue("", "", bounds!), [0, 200]);
  assert.deepEqual(getPriceSliderValue("0.03", "200", bounds!), [0.03, 200]);
  assert.deepEqual(getPriceSliderBounds({ min: 200, max: 200 }, 200, 200), {
    min: 0,
    max: 200,
  });
  assert.deepEqual(getPriceSliderBounds({ min: 200, max: 200 }, 100, 150), {
    min: 0,
    max: 200,
  });
  assert.deepEqual(getPriceSliderBounds({ min: 19.99, max: 19.99 }), {
    min: 0,
    max: 20,
  });
});

test("price slider is omitted when no positive range is available", () => {
  assert.equal(getPriceSliderBounds({ min: 0, max: 0 }), null);
  assert.equal(getPriceSliderBounds(null), null);
  assert.equal(getPriceSliderBounds(null, 25), null);
});

test("clearing filters preserves the search and ordering but resets pagination", () => {
  const parameters = parseSearchParameters({
    q: "lámpara",
    category_id: "pcat_one",
    seller_id: "sel_one",
    min_price: "12",
    sort: "newest",
    page: "4",
  });
  assert.equal(
    searchHref(clearSearchFilters(parameters)),
    "/search?q=l%C3%A1mpara&sort=newest",
  );
  assert.equal(searchHref(parseSearchParameters({})), "/search");
});

test("store selection preserves multiple stores in the URL and removes duplicates", () => {
  const parameters = parseSearchParameters({
    seller_id: ["sel_one", "sel_two", "sel_one"],
  });
  assert.deepEqual(parameters.sellerIds, ["sel_one", "sel_two"]);
  const url = new URL(searchHref(parameters), "https://store.example");
  assert.deepEqual(url.searchParams.getAll("seller_id"), ["sel_one", "sel_two"]);
  assert.deepEqual(
    parseSearchParameters({ seller_id: url.searchParams.getAll("seller_id") }).sellerIds,
    parameters.sellerIds,
  );
  assert.deepEqual(clearSearchFilters(parameters).sellerIds, []);
});

test("store selection rejects invalid IDs and limits the number of stores", () => {
  const stores = Array.from({ length: 25 }, (_, index) => `sel_${index}`);
  assert.deepEqual(
    parseSearchParameters({ seller_id: ["../invalid", ...stores] }).sellerIds,
    stores.slice(0, 20),
  );
});
