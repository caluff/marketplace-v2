import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  classifyCatalogError,
  getCatalogContentStatus,
  StorefrontTimeoutError,
} from "./catalog-state.ts"
import {
  isJwtExpired,
  safeRedirectPath,
  validateCredentials,
} from "./auth-utils.ts"
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

test("accepts only internal return paths", () => {
  assert.equal(safeRedirectPath("/account?tab=orders", "/"), "/account?tab=orders")
  assert.equal(safeRedirectPath("https://evil.example", "/account"), "/account")
  assert.equal(safeRedirectPath("//evil.example", "/account"), "/account")
  assert.equal(safeRedirectPath("/\\evil.example", "/account"), "/account")
  assert.equal(safeRedirectPath("/login", "/account"), "/account")
})

test("wires customer registration, restoration, reset, verification and logout", async () => {
  const actions = await readFile(new URL("../app/auth-actions.ts", import.meta.url), "utf8")
  const sdk = await readFile(new URL("./auth-sdk.ts", import.meta.url), "utf8")
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8")

  assert.match(actions, /auth\.login\("customer", "emailpass"/)
  assert.match(actions, /auth\.register\("customer", "emailpass"/)
  assert.match(actions, /store\.customer\.create\(/)
  assert.match(actions, /auth\.resetPassword\("customer", "emailpass"/)
  assert.match(actions, /auth\.updateProvider\(/)
  assert.match(actions, /auth\.verification\.confirm\(/)
  assert.match(actions, /finally[\s\S]*await clearCustomerSession\(\)/)
  assert.match(sdk, /sdk\.store\.customer\.retrieve\(\)/)
  assert.match(proxy, /pathname\.startsWith\("\/account"\)/)
})

test("uses generic credential and recovery responses", async () => {
  const actions = await readFile(new URL("../app/auth-actions.ts", import.meta.url), "utf8")

  assert.match(actions, /INVALID_CREDENTIALS/)
  assert.match(actions, /Si existe una cuenta con ese correo/)
  assert.doesNotMatch(actions, /usuario no existe|correo no registrado/i)
})

test("keeps customer forms accessible and pending-safe", async () => {
  const forms = await readFile(new URL("../components/auth/auth-forms.tsx", import.meta.url), "utf8")

  assert.match(forms, /aria-live="polite"/)
  assert.match(forms, /aria-label={visible \? "Ocultar contraseña" : "Mostrar contraseña"}/)
  assert.match(forms, /autoComplete="current-password"/)
  assert.match(forms, /autoComplete="new-password"/)
  assert.match(forms, /disabled={pending}/)
  assert.match(forms, /aria-disabled={pending}/)
})

test("validates email and password before authentication", () => {
  assert.deepEqual(validateCredentials("invalid", "short"), {
    email: "Ingresa un correo electrónico válido.",
    password: "La contraseña debe tener entre 8 y 256 caracteres.",
  })
  assert.deepEqual(validateCredentials("cliente@example.com", "correcta-123"), {})
})

test("detects expired and malformed JWTs for optimistic route protection", () => {
  const token = (exp: number) =>
    `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`
  assert.equal(isJwtExpired(token(Math.floor(Date.now() / 1000) - 5)), true)
  assert.equal(isJwtExpired(token(Math.floor(Date.now() / 1000) + 60)), false)
  assert.equal(isJwtExpired("not-a-token"), true)
})
