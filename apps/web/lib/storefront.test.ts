import assert from "node:assert/strict"
import test from "node:test"

import {
  classifyCatalogError,
  getCatalogContentStatus,
  StorefrontTimeoutError,
} from "./catalog-state.ts"
import { validateStorefrontEnvironment } from "./storefront-config.ts"

const TEST_PUBLISHABLE_KEY = `pk_${"a".repeat(64)}`

test("reports missing public configuration without returning values", () => {
  assert.deepEqual(validateStorefrontEnvironment({}), {
    status: "missing",
    missing: ["backend_url", "publishable_key"],
  })
})

test("rejects malformed backend URLs and non-publishable keys", () => {
  assert.deepEqual(
    validateStorefrontEnvironment({
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: "not-a-url",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY,
    }),
    { status: "invalid_backend_url" },
  )

  assert.deepEqual(
    validateStorefrontEnvironment({
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: "https://commerce.example.com",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "secret_value",
    }),
    { status: "invalid_publishable_key" },
  )

  assert.deepEqual(
    validateStorefrontEnvironment({
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: "https://commerce.example.com",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_too_short",
    }),
    { status: "invalid_publishable_key" },
  )
})

test("normalizes a safe Medusa configuration", () => {
  assert.deepEqual(
    validateStorefrontEnvironment({
      NEXT_PUBLIC_MEDUSA_BACKEND_URL: "https://commerce.example.com/medusa/",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: TEST_PUBLISHABLE_KEY,
    }),
    {
      status: "valid",
      config: {
        baseUrl: "https://commerce.example.com/medusa",
        publishableKey: TEST_PUBLISHABLE_KEY,
      },
    },
  )
})

test("keeps timeout, offline, network, rejected-key, and API states distinct", () => {
  assert.equal(
    classifyCatalogError(new StorefrontTimeoutError()),
    "request_timeout",
  )
  assert.equal(
    classifyCatalogError({ cause: { code: "ECONNREFUSED" } }),
    "backend_unavailable",
  )
  assert.equal(
    classifyCatalogError({ cause: { code: "ENOTFOUND" } }),
    "network_error",
  )
  assert.equal(classifyCatalogError({ status: 401 }), "key_rejected")
  assert.equal(classifyCatalogError({ status: 500 }), "store_api_error")
})

test("distinguishes an empty catalog from a catalog with products", () => {
  assert.equal(getCatalogContentStatus([]), "empty")
  assert.equal(getCatalogContentStatus([{ id: "prod_test" }]), "products")
})
