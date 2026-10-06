import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import { associateTrackingOrder } from "./account-link.ts"

const { FetchError } = createRequire(import.meta.url)("@medusajs/js-sdk")
const token = "v1.payload.signature"

test("invalid tracking credentials never request an account association", async () => {
  const client = { fetch: async () => assert.fail("Must not request a mutation") }
  for (const value of [null, undefined, "", [token], `${token}&order_id=other`, "x".repeat(2049)]) {
    assert.deepEqual(await associateTrackingOrder(client, value), { status: "invalid" })
  }
})

test("association uses a POST body and returns only an authenticated order destination", async () => {
  let calls = 0
  const result = await associateTrackingOrder({
    fetch: async (url, options) => {
      calls += 1
      assert.equal(url, "/store/order-tracking/claim")
      assert.equal(options.method, "POST")
      assert.deepEqual(options.body, { token })
      assert.equal(options.cache, "no-store")
      assert.equal(options.credentials, "omit")
      return { status: "associated", order_id: "order_123" }
    },
  }, token)
  assert.equal(calls, 1)
  assert.deepEqual(result, { status: "associated", orderId: "order_123" })
})

test("a malformed response cannot redirect outside the order detail", async () => {
  for (const response of [
    { status: "associated", order_id: "//other.invalid" },
    { status: "associated", order_id: "order_123/../settings" },
    { status: "associated", order_id: "order_123?token=secret" },
    { status: "other", order_id: "order_123" },
    {},
    null,
  ]) {
    assert.deepEqual(await associateTrackingOrder({ fetch: async () => response }, token), { status: "unavailable" })
  }
})

for (const status of [404, 410]) {
  test(`an unavailable link (${status}) produces an invalid state`, async () => {
    assert.deepEqual(await associateTrackingOrder({ fetch: async () => {
      throw new FetchError("Private details", "not_found", status)
    } }, token), { status: "invalid" })
  })
}

for (const status of [400, 401, 403, 409]) {
  test(`a refused association (${status}) does not expose account or order details`, async () => {
    assert.deepEqual(await associateTrackingOrder({ fetch: async () => {
      throw new FetchError("Private details", "not_allowed", status)
    } }, token), { status: "cannot_link" })
  })
}

test("provider or connection errors remain retryable without private error output", async () => {
  for (const error of [new FetchError("Private details", "server_error", 500), new TypeError("Private URL")]) {
    assert.deepEqual(await associateTrackingOrder({ fetch: async () => { throw error } }, token), { status: "unavailable" })
  }
  assert.deepEqual(await associateTrackingOrder(undefined, token), { status: "unavailable" })
})
