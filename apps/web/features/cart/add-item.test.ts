import assert from "node:assert/strict"
import test, { type TestContext } from "node:test"
import Medusa, { FetchError } from "@medusajs/js-sdk"
import { addCartItem, isSameOriginCartRequest } from "./add-item.ts"
import { cookieOptions, failure } from "./server-state.ts"

const PREFLIGHT_FIELDS = "id,currency_code,completed_at,region.countries.iso_2"
const input = { offer_id: "offer_123", quantity: 2 }
const usCart = {
  id: "cart_123",
  currency_code: "usd",
  completed_at: null,
  region: { countries: [{ iso_2: "us" }] },
}

function setup(context: TestContext, responses: Array<{ body: unknown; status?: number }>) {
  const sdk = new Medusa({
    baseUrl: "https://commerce.example.com",
    publishableKey: "pk_test_storefront",
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
  })
  const calls: Array<{ url: URL; method: string; body?: unknown }> = []
  context.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(
      new Headers(init?.headers).get("x-publishable-api-key"),
      "pk_test_storefront",
    )
    calls.push({
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    })
    const response = responses.shift()
    assert.ok(response, "unexpected backend request")
    return Response.json(response.body, { status: response.status ?? 200 })
  })
  const persistedIds: string[] = []
  let regionReads = 0
  return {
    calls,
    persistedIds,
    regionReads: () => regionReads,
    context: {
      sdk,
      cartId: "cart_123" as string | undefined,
      getRegion: async () => {
        regionReads++
        return { id: "reg_us" }
      },
      persistCartId: (id: string) => {
        persistedIds.push(id)
      },
    },
  }
}

test("adding to an existing cart uses one lean read and one native mutation", async (context) => {
  context.mock.method(Date, "now", () => 1000)
  const state = setup(context, [
    { body: { cart: usCart } },
    { body: { cart: { id: usCart.id, items: [{ quantity: 3 }, { quantity: 2 }] } } },
  ])

  assert.deepEqual(await addCartItem(input, state.context), {
    success: "Producto añadido al carrito.",
    cartCount: 5,
    confirmedAt: 1000,
  })
  assert.equal(state.regionReads(), 0)
  assert.deepEqual(state.persistedIds, [])
  assert.deepEqual(state.calls.map(({ url, method, body }) => ({
    path: url.pathname,
    fields: url.searchParams.get("fields"),
    method,
    body,
  })), [
    { path: "/store/carts/cart_123", fields: PREFLIGHT_FIELDS, method: "GET", body: undefined },
    { path: "/store/carts/cart_123/line-items", fields: "id,items.quantity", method: "POST", body: input },
  ])
})

test("a first cart is created with lean fields and its cookie persists before adding", async (context) => {
  const state = setup(context, [
    { body: { cart: usCart } },
    { body: { cart: { id: usCart.id, items: [{ quantity: 2 }] } } },
  ])
  state.context.cartId = undefined
  await addCartItem(input, state.context)
  assert.equal(state.regionReads(), 1)
  assert.deepEqual(state.persistedIds, [usCart.id])
  assert.equal(state.calls.length, 2)
  assert.equal(state.calls[0].url.pathname, "/store/carts")
  assert.equal(state.calls[0].url.searchParams.get("fields"), PREFLIGHT_FIELDS)
  assert.deepEqual(state.calls[0].body, { region_id: "reg_us" })
  assert.equal(cookieOptions.httpOnly, true)
  assert.equal(cookieOptions.sameSite, "lax")
})

test("invalid offer and quantity input never reaches the backend", async (context) => {
  const state = setup(context, [])
  for (const invalid of [
    null,
    { ...input, offer_id: "prod_123" },
    { ...input, quantity: "2" },
    { ...input, quantity: 0 },
    { ...input, quantity: 1.5 },
    { ...input, quantity: 100 },
    { ...input, quantity: Number.NaN },
  ]) {
    await assert.rejects(addCartItem(invalid, state.context))
  }
  assert.equal(state.calls.length, 0)
  assert.equal(state.regionReads(), 0)
})

test("carts outside US/USD are rejected before mutation", async (context) => {
  for (const cart of [
    { ...usCart, currency_code: "eur" },
    { ...usCart, region: { countries: [{ iso_2: "ca" }] } },
  ]) {
    const state = setup(context, [{ body: { cart } }])
    await assert.rejects(addCartItem(input, state.context), /Estados Unidos y USD/)
    assert.equal(state.calls.length, 1)
  }
})

test("stock failures propagate without a false success or losing a newly created cart", async (context) => {
  const state = setup(context, [
    { body: { cart: usCart } },
    { body: { message: "Insufficient inventory", type: "invalid_data" }, status: 400 },
  ])
  state.context.cartId = undefined
  await assert.rejects(addCartItem(input, state.context), (error: unknown) => {
    assert.ok(error instanceof FetchError)
    assert.equal(error.status, 400)
    assert.match(failure(error).error, /stock suficiente/)
    return true
  })
  assert.deepEqual(state.persistedIds, [usCart.id])
  assert.equal(state.calls.length, 2)
})

test("expired or completed cart cookies are replaced before adding to a new cart", async (context) => {
  for (const previousCart of [
    { body: { message: "Cart not found" }, status: 404 },
    { body: { cart: { ...usCart, completed_at: "2026-09-08T10:00:00Z" } } },
  ]) {
    const state = setup(context, [
      previousCart,
      { body: { cart: { ...usCart, id: "cart_new" } } },
      { body: { cart: { id: "cart_new", items: [{ quantity: 2 }] } } },
    ])
    assert.equal((await addCartItem(input, state.context)).cartCount, 2)
    assert.deepEqual(state.persistedIds, ["cart_new"])
    assert.equal(state.calls.length, 3)
    assert.equal(state.calls[2].url.pathname, "/store/carts/cart_new/line-items")
  }
})

test("cart mutations reject missing, malformed and foreign origins", () => {
  for (const origin of [undefined, "null", "not-a-url", "https://attacker.example", "https://shop.example:8080"]) {
    const headers = new Headers({ host: "shop.example" })
    if (origin) headers.set("origin", origin)
    assert.equal(isSameOriginCartRequest(new Request("https://shop.example/api/cart/items", { headers })), false)
  }
  assert.equal(isSameOriginCartRequest(new Request("https://shop.example/api/cart/items", {
    headers: { host: "shop.example", origin: "https://shop.example" },
  })), true)
})
