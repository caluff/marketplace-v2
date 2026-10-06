import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import { retrieveOrderTracking } from "./read.ts"

const { FetchError } = createRequire(import.meta.url)("@medusajs/js-sdk")
const token = "v1.payload.signature"

test("malformed or repeated tokens never reach the API", async () => {
  const client = {
    fetch: async () => {
      throw new Error("An invalid token must not be requested")
    },
  }
  for (const value of [undefined, "", [token], `${token} with spaces`, "x".repeat(2049)]) {
    assert.deepEqual(await retrieveOrderTracking(client, value), {
      status: "invalid",
    })
  }
})

test("a private token travels only in a noncached anonymous POST body", async () => {
  const order = { display_id: 42 }
  let calls = 0
  const result = await retrieveOrderTracking(
    {
      fetch: async (url, options) => {
        calls += 1
        assert.equal(url, "/store/order-tracking")
        assert.equal(options.method, "POST")
        assert.deepEqual(options.body, { token })
        assert.equal(options.cache, "no-store")
        assert.equal(options.credentials, "omit")
        assert.equal(options.headers, undefined)
        return { order }
      },
    },
    token,
  )
  assert.equal(calls, 1)
  assert.deepEqual(result, { status: "available", order })
})

test("missing SDK configuration is a service error", async () => {
  assert.deepEqual(await retrieveOrderTracking(undefined, token), {
    status: "unavailable",
  })
})

for (const status of [400, 404, 410]) {
  test(`a rejected or expired link (${status}) has a local invalid state`, async () => {
    assert.deepEqual(
      await retrieveOrderTracking(
        {
          fetch: async () => {
            throw new FetchError("Private failure details", "not_found", status)
          },
        },
        token,
      ),
      { status: "invalid" },
    )
  })
}

for (const status of [401, 403, 429, 500]) {
  test(`service failure (${status}) does not claim the link is expired`, async () => {
    assert.deepEqual(
      await retrieveOrderTracking(
        {
          fetch: async () => {
            throw new FetchError("Private failure details", "service_error", status)
          },
        },
        token,
      ),
      { status: "unavailable" },
    )
  })
}

test("connection failures expose no technical or private error details", async () => {
  assert.deepEqual(
    await retrieveOrderTracking(
      {
        fetch: async () => {
          throw new Error(`fetch failed: ${token}`)
        },
      },
      token,
    ),
    { status: "unavailable" },
  )
})
