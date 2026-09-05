import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { FetchError } from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"

import { retrieveCustomerSession } from "../../lib/auth-sdk"

const customer: HttpTypes.StoreCustomer = {
  id: "customer_test",
  email: "buyer@example.test",
  first_name: null,
  last_name: null,
  company_name: null,
  default_billing_address_id: null,
  default_shipping_address_id: null,
  addresses: [],
}

test("customer session returns anonymous only after explicit authentication denial", async () => {
  for (const status of [401, 403]) {
    assert.equal(await retrieveCustomerSession({
      retrieve: async () => { throw new FetchError("Denied", "", status) },
    }), null)
  }
})

test("customer outages cannot become anonymous sessions and can recover on retry", async () => {
  for (const error of [
    new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }),
    new DOMException("Request timed out", "TimeoutError"),
    ...[400, 404, 429, 500, 502, 503].map(
      (status) => new FetchError("Request failed", "", status),
    ),
    new FetchError("No response status"),
  ]) {
    let unavailable = true
    const client = {
      retrieve: async () => {
        if (unavailable) throw error
        return { customer }
      },
    }
    await assert.rejects(retrieveCustomerSession(client), (thrown) => thrown === error)
    unavailable = false
    assert.equal(await retrieveCustomerSession(client), customer)
  }
  await assert.rejects(retrieveCustomerSession(undefined), /no está disponible/)
})

test("customer auth failures reach the parent boundary without clearing cookies", async () => {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8")
  const sdk = await read("../../lib/auth-sdk.ts")
  const currentCustomer = sdk.slice(sdk.indexOf("export async function getCurrentCustomer"))
  const boundary = await read("../../app/error.tsx")
  const account = await read("./data.ts")

  assert.match(currentCustomer, /if \(!token\) return null/)
  assert.match(currentCustomer, /return retrieveCustomerSession\(sdk\?\.store\.customer\)/)
  assert.doesNotMatch(currentCustomer, /clearCustomerSession|\.delete\(/)
  assert.match(boundary, /role="alert"/)
  assert.match(boundary, /window\.location\.reload\(\)/)
  assert.match(account, /error\.status === 401/)
  assert.match(account, /throw new Error\("No pudimos cargar tu cuenta/)
})
