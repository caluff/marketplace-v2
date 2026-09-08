import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  classifyCatalogError,
  getCatalogContentStatus,
  StorefrontTimeoutError,
  withTimeout,
} from "./catalog-state.ts"
import { createCatalogSdk } from "./catalog-sdk.ts"
import {
  isOptimizableProductImage,
  productImagePattern,
} from "./product-image-config.ts"
import {
  isJwtExpired,
  safeRedirectPath,
  validateCredentials,
} from "./auth-utils.ts"
import { validateStorefrontEnvironment } from "./storefront-config.ts"

const TEST_PUBLISHABLE_KEY = `pk_${"a".repeat(64)}`

test("catalog deadlines cancel the actual SDK transport, preserving its public key", async (context) => {
  let aborted = false
  context.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init: RequestInit) => {
      assert.equal(
        new Headers(init.headers).get("x-publishable-api-key"),
        TEST_PUBLISHABLE_KEY,
      )
      assert.equal(init.cache, "no-store")
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => {
            aborted = true
            reject(init.signal?.reason)
          },
          { once: true },
        )
      })
    },
  )
  await assert.rejects(
    withTimeout(
      (signal) =>
        createCatalogSdk(
          {
            baseUrl: "https://commerce.example.com",
            publishableKey: TEST_PUBLISHABLE_KEY,
          },
          signal,
        ).store.product.list({ limit: 1 }),
      20,
    ),
    StorefrontTimeoutError,
  )
  assert.equal(aborted, true)
})

test("a cancelled SDK read does not cancel another visitor's SDK", async (context) => {
  const first = new AbortController()
  const second = new AbortController()
  let requests = 0
  context.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init: RequestInit) => {
      requests++
      assert.equal(init.signal?.aborted, false)
      return Response.json({ regions: [{ id: "reg_us" }] })
    },
  )
  const config = {
    baseUrl: "https://commerce.example.com",
    publishableKey: TEST_PUBLISHABLE_KEY,
  }
  const cancelled = createCatalogSdk(config, first.signal)
  const active = createCatalogSdk(config, second.signal)
  first.abort()
  await assert.rejects(async () => cancelled.store.region.list())
  assert.equal((await active.store.region.list()).regions[0].id, "reg_us")
  assert.equal(requests, 1)
})

test("public image optimization allows only the configured HTTPS folder", () => {
  const base =
    "https://images.example.com/storage/v1/object/public/products/products"
  assert.deepEqual(productImagePattern(base), {
    protocol: "https",
    hostname: "images.example.com",
    port: "",
    pathname: "/storage/v1/object/public/products/products/**",
    search: "",
  })
  assert.equal(
    isOptimizableProductImage(new URL(`${base}/photo.jpg`), base),
    true,
  )
  for (const url of [
    "https://other.example.com/storage/v1/object/public/products/products/photo.jpg",
    `${base}-other/photo.jpg`,
    `${base}/../private/photo.jpg`,
    `${base}/photo.jpg?token=secret`,
    `${base}/photo.jpg#fragment`,
    "http://images.example.com/storage/v1/object/public/products/products/photo.jpg",
  ])
    assert.equal(isOptimizableProductImage(new URL(url), base), false)
  for (const value of [
    undefined,
    "https://images.example.com",
    `${base}?token=secret`,
    "https://*.example.com/products",
    "https://user:secret@images.example.com/products",
  ])
    assert.equal(productImagePattern(value), null)
})

test("catalog products resolve even while category navigation is still loading", async (context) => {
  const previousUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
  const previousKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = "https://commerce.example.com"
  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = TEST_PUBLISHABLE_KEY
  context.after(() => {
    if (previousUrl === undefined)
      delete process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
    else process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = previousUrl
    if (previousKey === undefined)
      delete process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
    else process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = previousKey
  })
  let releaseCategories!: (response: Response) => void
  let categoriesResolved = false
  const delayedCategories = new Promise<Response>((resolve) => {
    releaseCategories = resolve
  })
  context.mock.method(globalThis, "fetch", async (input: URL) => {
    if (input.pathname === "/store/product-categories") return delayedCategories
    if (input.pathname === "/store/regions")
      return Response.json({
        regions: [
          { id: "reg_eu", currency_code: "eur", countries: [{ iso_2: "fr" }] },
          { id: "reg_us", currency_code: "usd", countries: [{ iso_2: "us" }] },
        ],
      })
    if (input.pathname === "/store/offers") {
      assert.equal(input.searchParams.get("region_id"), "reg_us")
      assert.equal(input.searchParams.get("country_code"), "us")
      assert.match(input.searchParams.get("fields") ?? "", /calculated_price/)
      return Response.json({
        offers: [
          {
            id: "offer_one",
            product_id: "prod_one",
            calculated_price: {
              calculated_amount: 200,
              original_amount: 200,
              currency_code: "usd",
            },
          },
        ],
        count: 1,
        offset: 0,
        limit: 100,
      })
    }
    assert.equal(input.pathname, "/store/products")
    assert.equal(input.searchParams.get("region_id"), "reg_us")
    return Response.json({ products: [{ id: "prod_one" }], count: 1 })
  })
  const { getStorefrontCatalog, getStorefrontCategories } =
    await import("./medusa.ts")
  const categories = getStorefrontCategories().then((result) => {
    categoriesResolved = true
    return result
  })
  try {
    const result = await getStorefrontCatalog()
    assert.equal(result.status, "products")
    assert.equal(categoriesResolved, false)
    if (result.status === "products") {
      assert.equal(result.hasRegion, true)
      assert.equal(result.products[0]?.id, "prod_one")
      assert.equal(result.offers[0]?.calculated_price?.calculated_amount, 200)
    }
  } finally {
    releaseCategories(Response.json({ product_categories: [] }))
    await categories
  }
})

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
  assert.equal(
    safeRedirectPath("/account?tab=orders", "/"),
    "/account?tab=orders",
  )
  assert.equal(safeRedirectPath("https://evil.example", "/account"), "/account")
  assert.equal(safeRedirectPath("//evil.example", "/account"), "/account")
  assert.equal(safeRedirectPath("/\\evil.example", "/account"), "/account")
  assert.equal(safeRedirectPath("/login", "/account"), "/account")
})

test("wires customer registration, restoration, reset, verification and logout", async () => {
  const actions = await readFile(
    new URL("../app/auth-actions.ts", import.meta.url),
    "utf8",
  )
  const sdk = await readFile(new URL("./auth-sdk.ts", import.meta.url), "utf8")
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8")

  assert.match(actions, /auth\.login\("customer", "emailpass"/)
  assert.match(actions, /auth\.register\("customer", "emailpass"/)
  assert.match(actions, /store\.customer\.create\(/)
  assert.match(actions, /auth\.resetPassword\("customer", "emailpass"/)
  assert.match(actions, /auth\.updateProvider\(/)
  assert.match(actions, /auth\.verification\.confirm\(/)
  assert.match(actions, /finally[\s\S]*await clearCustomerSession\(\)/)
  assert.match(sdk, /retrieveCustomerSession\(sdk\?\.store\.customer\)/)
  assert.match(proxy, /pathname\.startsWith\("\/account"\)/)
})

test("uses generic credential and recovery responses", async () => {
  const actions = await readFile(
    new URL("../app/auth-actions.ts", import.meta.url),
    "utf8",
  )

  assert.match(actions, /INVALID_CREDENTIALS/)
  assert.match(actions, /Si existe una cuenta con ese correo/)
  assert.doesNotMatch(actions, /usuario no existe|correo no registrado/i)
})

test("keeps customer forms accessible and pending-safe", async () => {
  const forms = await readFile(
    new URL("../components/auth/auth-forms.tsx", import.meta.url),
    "utf8",
  )

  assert.match(forms, /<FeedbackToast feedback={state}/)
  const layout = await readFile(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  )
  const toaster = await readFile(
    new URL("../components/ui/sonner.tsx", import.meta.url),
    "utf8",
  )
  assert.match(layout, /<Toaster/)
  assert.match(toaster, /containerAriaLabel="Notificaciones"/)
  assert.match(toaster, /Cerrar notificación/)
  assert.match(
    forms,
    /aria-label={visible \? "Ocultar contraseña" : "Mostrar contraseña"}/,
  )
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
  assert.deepEqual(
    validateCredentials("cliente@example.com", "correcta-123"),
    {},
  )
})

test("detects expired and malformed JWTs for optimistic route protection", () => {
  const token = (exp: number) =>
    `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`
  assert.equal(isJwtExpired(token(Math.floor(Date.now() / 1000) - 5)), true)
  assert.equal(isJwtExpired(token(Math.floor(Date.now() / 1000) + 60)), false)
  assert.equal(isJwtExpired("not-a-token"), true)
})
