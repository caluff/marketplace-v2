import assert from "node:assert/strict"
import test from "node:test"
import { getSiteUrl } from "./site-url.ts"

test("the explicit public origin takes precedence over Railway's generated domain", () => {
  assert.equal(getSiteUrl({
    NEXT_PUBLIC_SITE_URL: " https://shop.example.com/ ",
    RAILWAY_PUBLIC_DOMAIN: "old-domain.up.railway.app",
  }).href, "https://shop.example.com/")
})

test("Railway fallback uses HTTPS and development has its own local origin", () => {
  assert.equal(getSiteUrl({ RAILWAY_PUBLIC_DOMAIN: "shop.up.railway.app" }).href, "https://shop.up.railway.app/")
  assert.equal(getSiteUrl({}).href, "http://localhost:3000/")
})

test("invalid public origins cannot leak credentials or add paths and query parameters to metadata", () => {
  for (const value of [
    "not a URL",
    "ftp://shop.example.com",
    "https://user:password@shop.example.com",
    "https://shop.example.com/subpath",
    "https://shop.example.com/?token=private",
    "https://shop.example.com/#fragment",
  ]) {
    assert.throws(() => getSiteUrl({ NEXT_PUBLIC_SITE_URL: value }))
  }
})
