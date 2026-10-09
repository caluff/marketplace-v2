import assert from "node:assert/strict"
import test from "node:test"
import { isPickupOrder } from "../account/order-delivery.ts"
import { getTrackingProgress } from "./progress.ts"

const pickup = {
  shipping_option: { service_zone: { fulfillment_set: { type: "pickup" } } },
}
const shipping = {
  shipping_option: { service_zone: { fulfillment_set: { type: "shipping" } } },
}

test("pickup is identified from native options before any fulfillment exists", () => {
  assert.equal(isPickupOrder({ shipping_methods: [pickup] }), true)
  assert.equal(isPickupOrder({ shipping_methods: [pickup, pickup] }), true)
  assert.equal(
    isPickupOrder({
      shipping_methods: [
        { shipping_option: { metadata: { marketplace_v2_pickup: true } } },
      ],
    }),
    true,
  )
})

test("names, mixed methods, missing and unknown options never imply all-store pickup", () => {
  for (const shipping_methods of [
    null,
    [],
    [shipping],
    [pickup, shipping],
    [pickup, {}],
    [{ name: "Recogida en tienda" }],
  ]) {
    assert.equal(isPickupOrder({ shipping_methods }), false)
  }
})

test("pickup timeline dates skip shipping and never invent a collection date", () => {
  const order = {
    status: "completed",
    fulfillment_status: "fulfilled",
    delivery_mode: "pickup",
    created_at: "2026-10-08T12:00:00Z",
    items: [],
    fulfillments: [
      {
        created_at: "2026-10-08T13:00:00Z",
        packed_at: null,
        shipped_at: null,
        delivered_at: null,
        canceled_at: null,
      },
    ],
  }
  const steps = getTrackingProgress(order)
  assert.equal(steps.length, 3)
  assert.equal(steps[1].completedAt, "2026-10-08T13:00:00Z")
  assert.equal(steps[2].complete, true)
  assert.equal(steps[2].completedAt, null)
  const delivered = getTrackingProgress({
    ...order,
    fulfillments: [
      { ...order.fulfillments[0], delivered_at: "2026-10-08T14:00:00Z" },
    ],
  })
  assert.equal(delivered[2].completedAt, "2026-10-08T14:00:00Z")
})
