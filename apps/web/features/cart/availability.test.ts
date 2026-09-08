import assert from "node:assert/strict"
import test, { type TestContext } from "node:test"
import Medusa from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { getCartAvailability } from "./availability.ts"

function cart(items: unknown[]): Pick<HttpTypes.StoreCart, "items"> {
  return { items: items as HttpTypes.StoreCartLineItem[] }
}

function setup(context: TestContext, pages: unknown[]) {
  const requests: URL[] = []
  context.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(init?.method ?? "GET", "GET")
      assert.equal(
        new Headers(init?.headers).get("x-publishable-api-key"),
        "pk_availability_test",
      )
      assert.ok(init?.signal)
      assert.equal(init.signal.aborted, false)
      requests.push(new URL(String(input)))
      const page = pages.shift()
      assert.ok(page, "unexpected availability request")
      return Response.json(page)
    },
  )
  const sdk = new Medusa({
    baseUrl: "https://commerce.example.com",
    publishableKey: "pk_availability_test",
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
  })
  return { requests, getSdk: async () => sdk }
}

test("cart availability requests only its offers and inventory through the SDK", async (context) => {
  const offers = [{ id: "offer_a", inventory_quantity: 20 }]
  const state = setup(context, [{ offers, count: 1, offset: 0, limit: 100 }])
  assert.deepEqual(
    await getCartAvailability(
      cart([
        {
          product_id: "prod_a",
          offer: { id: "offer_a" },
          metadata: { offer_id: "offer_stale" },
        },
        { product_id: "prod_a", metadata: { offer_id: "offer_b" } },
        { product_id: "prod_a", offer: { id: "offer_a" } },
      ]),
      state.getSdk,
    ),
    offers,
  )
  assert.equal(state.requests.length, 1)
  const { pathname, searchParams } = state.requests[0]
  assert.equal(pathname, "/store/offers")
  assert.deepEqual(
    [searchParams.get("id[0]"), searchParams.get("id[1]")],
    ["offer_a", "offer_b"],
  )
  assert.equal(searchParams.has("id[2]"), false)
  assert.equal(searchParams.get("product_id[0]"), "prod_a")
  assert.equal(searchParams.has("product_id[1]"), false)
  assert.equal(searchParams.get("limit"), "100")
  assert.equal(searchParams.get("offset"), "0")
  assert.equal(searchParams.has("region_id"), false)
  assert.equal(searchParams.has("country_code"), false)
  const fields = searchParams.get("fields")?.split(",") ?? []
  for (const field of [
    "id",
    "manage_inventory",
    "allow_backorder",
    "inventory_quantity",
    "inventory_item_link.required_quantity",
    "inventory_item_link.inventory_item.id",
    "inventory_item_link.inventory_item.location_levels.location_id",
    "inventory_item_link.inventory_item.location_levels.stocked_quantity",
  ]) {
    assert.ok(fields.includes(field), `missing inventory dependency: ${field}`)
  }
  assert.equal(fields.some((field) => /price|seller|product_variant/.test(field)), false)
})

test("availability reads every page while keeping each request limited to 100 offers", async (context) => {
  const offers = Array.from({ length: 101 }, (_, index) => ({
    id: `offer_${index}`,
    inventory_quantity: index,
  }))
  const state = setup(context, [
    { offers: offers.slice(0, 100), count: 101, offset: 0, limit: 100 },
    { offers: offers.slice(100), count: 101, offset: 100, limit: 100 },
  ])
  const result = await getCartAvailability(
    cart(offers.map((offer) => ({ product_id: "prod_a", offer }))),
    state.getSdk,
  )
  assert.deepEqual(result, offers)
  assert.deepEqual(state.requests.map((request) => request.searchParams.get("offset")), ["0", "100"])
  assert.ok(state.requests.every((request) => request.searchParams.get("limit") === "100"))
})

test("an empty cart or missing offer/product references never initializes the SDK", async () => {
  const getSdk = async (): Promise<Medusa> => {
    assert.fail("empty availability must not initialize the SDK")
  }
  for (const items of [
    [],
    [{ product_id: "prod_a" }],
    [{ offer: { id: "offer_a" } }],
    [{ product_id: "prod_a", offer: null, metadata: { offer_id: 12 } }],
  ]) {
    assert.deepEqual(await getCartAvailability(cart(items), getSdk), [])
  }
})

test("an empty page ends pagination if the reported count changes during the read", async (context) => {
  const state = setup(context, [{ offers: [], count: 1, offset: 0, limit: 100 }])
  assert.deepEqual(
    await getCartAvailability(
      cart([{ product_id: "prod_a", offer: { id: "offer_a" } }]),
      state.getSdk,
    ),
    [],
  )
  assert.equal(state.requests.length, 1)
})
