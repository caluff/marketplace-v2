import assert from "node:assert/strict"
import test from "node:test"
import { buildSitemapEntries, collectSitemapProducts } from "./sitemap.ts"

test("sitemap reads every public catalog page with stable pagination and minimal fields", async () => {
  const products = Array.from({ length: 102 }, (_, index) => ({
    id: `prod_${index}`,
    handle: `product-${index}`,
    updated_at: null,
  }))
  const offsets = []
  const result = await collectSitemapProducts(async (query) => {
    offsets.push(query.offset)
    assert.equal(query.limit, 100)
    assert.equal(query.order, "id")
    assert.equal(query.fields, "id,handle,updated_at")
    return {
      products: products.slice(query.offset, query.offset + query.limit),
      count: products.length,
    }
  })

  assert.deepEqual(offsets, [0, 100])
  assert.deepEqual(result, products)
})

test("an empty public catalog produces only the homepage", async () => {
  const products = await collectSitemapProducts(async () => ({ products: [], count: 0 }))
  assert.deepEqual(buildSitemapEntries(products, new URL("https://example.com")), [
    { url: "https://example.com/" },
  ])
})

test("a failed later page rejects instead of publishing a partial sitemap", async () => {
  await assert.rejects(collectSitemapProducts(async ({ offset }) => {
    if (offset) throw new Error("Store API unavailable")
    return { products: [{ handle: "first-product" }], count: 2 }
  }), /Store API unavailable/)
})

test("an unexpectedly empty page rejects instead of dropping products or looping", async () => {
  await assert.rejects(
    collectSitemapProducts(async () => ({ products: [], count: 1 })),
    /incomplete sitemap page/,
  )
})

test("a catalog exceeding the single-file protocol limit is not silently truncated", async () => {
  await assert.rejects(
    collectSitemapProducts(async () => ({ products: [{ handle: "first" }], count: 50000 })),
    /multiple sitemaps/,
  )
})

test("entries include only clean homepage and unique product URLs under the public origin", () => {
  const entries = buildSitemapEntries([
    { handle: "café & té", updated_at: "2026-10-09T12:00:00Z" },
    { handle: "café & té", updated_at: "2026-10-09T12:00:00Z" },
    { handle: "//outside.example/path?next=account", updated_at: null },
    { handle: "", updated_at: null },
    { handle: null, updated_at: null },
  ], new URL("https://example.com/"))

  assert.deepEqual(entries, [
    { url: "https://example.com/" },
    { url: "https://example.com/products/caf%C3%A9%20%26%20t%C3%A9", lastModified: "2026-10-09T12:00:00Z" },
    { url: "https://example.com/products/%2F%2Foutside.example%2Fpath%3Fnext%3Daccount" },
  ])
})

test("lastModified uses real valid API dates and omits missing or invalid dates", () => {
  const entries = buildSitemapEntries([
    { handle: "leap-day", updated_at: "2024-02-29T23:30:00-05:00" },
    { handle: "invalid-day", updated_at: "2025-02-29T12:00:00Z" },
    { handle: "invalid-date", updated_at: "not a date" },
    { handle: "missing-date", updated_at: null },
  ], new URL("https://example.com"))

  assert.equal(entries[1].lastModified, "2024-02-29T23:30:00-05:00")
  for (const entry of [entries[0], ...entries.slice(2)]) {
    assert.equal(Object.hasOwn(entry, "lastModified"), false)
  }
})
