import assert from "node:assert/strict"
import test from "node:test"
import { vendorSessionCallbackUrl, vendorSessionDocument } from "./vendor-session"

test("the vendor callback is restricted to the configured origin", () => {
  assert.equal(vendorSessionCallbackUrl("http://localhost:7001"), "http://localhost:7001/auth/storefront")
  assert.equal(vendorSessionCallbackUrl("https://vendor.example.com"), "https://vendor.example.com/auth/storefront")
  for (const value of [undefined, "//evil.test", "http://vendor.example.com", "https://user:pass@vendor.example.com", "https://vendor.example.com/redirect", "https://vendor.example.com?next=evil", "javascript:alert(1)"]) assert.equal(vendorSessionCallbackUrl(value), null)
})

test("handoff posts only the one-use code in the body with a nonce script", () => {
  const code = "a".repeat(64)
  const nonce = "b".repeat(32)
  const html = vendorSessionDocument("https://vendor.example.com/auth/storefront", code, nonce)
  assert.match(html, /method="post" action="https:\/\/vendor\.example\.com\/auth\/storefront"/)
  assert.match(html, new RegExp(`name="code" value="${code}"`))
  assert.match(html, new RegExp(`script nonce="${nonce}"`))
  assert.doesNotMatch(html, /\?code=|access_token|Bearer|localStorage/)
  assert.throws(() => vendorSessionDocument("https://vendor.example.com/auth/storefront", '<script>alert(1)</script>', nonce))
})
