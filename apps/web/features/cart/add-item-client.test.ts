import assert from "node:assert/strict"
import test from "node:test"
import { submitCartItem } from "./add-item-client.ts"

function itemForm() {
  const form = new FormData()
  form.set("offer_id", "offer_available")
  form.set("quantity", "2")
  return form
}

test("adding uses the storefront handler and returns the server-confirmed count", async (context) => {
  context.mock.method(globalThis, "fetch", async (url: unknown, init: RequestInit) => {
    assert.equal(url, "/api/cart/items")
    assert.equal(init.method, "POST")
    assert.equal(init.credentials, "same-origin")
    assert.deepEqual(JSON.parse(String(init.body)), {
      offer_id: "offer_available",
      quantity: 2,
    })
    return Response.json({ success: "Producto añadido al carrito.", cartCount: 5, confirmedAt: 1000 })
  })
  assert.deepEqual(await submitCartItem(itemForm()), {
    success: "Producto añadido al carrito.",
    cartCount: 5,
    confirmedAt: 1000,
  })
})

test("stock rejection stays an error and cannot change the confirmed count", async (context) => {
  context.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "No hay stock suficiente." }, { status: 409 }),
  )
  assert.deepEqual(await submitCartItem(itemForm()), {
    error: "No hay stock suficiente.",
  })
})

test("an ambiguous network failure never retries an increment automatically", async (context) => {
  let calls = 0
  context.mock.method(globalThis, "fetch", async () => {
    calls++
    throw new TypeError("Connection closed after request was sent")
  })
  const result = await submitCartItem(itemForm())
  assert.equal(calls, 1)
  assert(typeof result.error === "string")
  assert.match(result.error, /Consulta el carrito antes de volver/)
})

test("malformed counts and unsuccessful HTTP responses cannot announce success", async (context) => {
  for (const [status, cartCount] of [
    [200, -1],
    [200, 1.5],
    [200, "3"],
    [500, 3],
  ] as const) {
    context.mock.method(globalThis, "fetch", async () =>
      Response.json({ success: "Added", cartCount, confirmedAt: 1000 }, { status }),
    )
    assert("error" in (await submitCartItem(itemForm())))
  }
})
