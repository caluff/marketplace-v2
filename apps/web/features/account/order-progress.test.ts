import assert from "node:assert/strict"
import test from "node:test"
import type { HttpTypes } from "@medusajs/types"
import { getOrderProgress, safeTrackingUrl } from "./order-progress"

test("order timeline distinguishes pending, partial shipping, delivery and cancellation", () => {
  const base = { status: "pending", created_at: "2026-09-12T00:00:00Z" }
  assert.deepEqual(
    getOrderProgress({ ...base, fulfillment_status: "not_fulfilled" }).map(
      (s) => s.complete,
    ),
    [true, false, false, false],
  )
  assert.equal(
    getOrderProgress({ ...base, fulfillment_status: "partially_shipped" })[2]
      .complete,
    false,
  )
  assert.deepEqual(
    getOrderProgress({ ...base, fulfillment_status: "delivered" }).map(
      (s) => s.complete,
    ),
    [true, true, true, true],
  )
  assert.deepEqual(
    getOrderProgress({
      ...base,
      status: "canceled",
      fulfillment_status: "shipped",
    }).map((s) => s.complete),
    [true, false, false, false],
  )
})

test("tracking links reject executable and credential-bearing URLs", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://tracking.example.com",
    "https://user:secret@tracking.example.com",
    "/relative",
    "invalid",
  ])
    assert.equal(safeTrackingUrl(value), null)
  assert.equal(
    safeTrackingUrl("https://tracking.example.com/package/123"),
    "https://tracking.example.com/package/123",
  )
})

test("partial packages do not complete stages for unprepared items", () => {
  const order = {
    status: "pending",
    fulfillment_status: "partially_delivered",
    created_at: "2026-09-12T00:00:00Z",
    items: [
      { quantity: 2, detail: { fulfilled_quantity: 1, shipped_quantity: 1 } },
    ],
  } as HttpTypes.StoreOrder
  assert.deepEqual(
    getOrderProgress(order).map((step) => step.complete),
    [true, false, false, false],
  )
  order.items![0].detail.fulfilled_quantity = 2
  assert.deepEqual(
    getOrderProgress(order).map((step) => step.complete),
    [true, true, false, false],
  )
})
