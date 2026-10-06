import assert from "node:assert/strict"
import test from "node:test"

import { getTrackingProgress } from "./progress.ts"

const receivedAt = "2026-10-06T12:00:00Z"

function order(overrides = {}) {
  return {
    status: "pending",
    fulfillment_status: "not_fulfilled",
    created_at: receivedAt,
    items: [{ quantity: 3, detail: {
      fulfilled_quantity: 0, shipped_quantity: 0, delivered_quantity: 0,
    } }],
    fulfillments: [],
    ...overrides,
  }
}

function shipment(overrides = {}) {
  return {
    id: "ful_test",
    created_at: "2026-10-07T10:00:00Z",
    packed_at: "2026-10-07T11:00:00Z",
    shipped_at: "2026-10-08T10:00:00Z",
    delivered_at: "2026-10-09T10:00:00Z",
    canceled_at: null,
    labels: [],
    ...overrides,
  }
}

function item(fulfilled, shipped, delivered) {
  return { quantity: 3, detail: {
    fulfilled_quantity: fulfilled, shipped_quantity: shipped,
    delivered_quantity: delivered,
  } }
}

test("received orders show their actual creation date and no future dates", () => {
  const steps = getTrackingProgress(order())
  assert.deepEqual(steps.map((step) => step.complete), [true, false, false, false])
  assert.deepEqual(steps.map((step) => step.completedAt), [receivedAt, null, null, null])
})

test("partial preparation does not become a completed milestone because a package exists", () => {
  const steps = getTrackingProgress(order({
    fulfillment_status: "partially_fulfilled",
    items: [item(1, 0, 0)],
    fulfillments: [shipment({ shipped_at: null, delivered_at: null })],
  }))
  assert.equal(steps[1].complete, false)
  assert.equal(steps[1].completedAt, null)
})

test("preparation uses the last active package date and preserves the input", () => {
  const input = order({
    fulfillment_status: "fulfilled",
    items: [item(3, 0, 0)],
    fulfillments: [
      shipment({ packed_at: "2026-10-07T11:00:00Z", shipped_at: null, delivered_at: null }),
      shipment({ packed_at: "2026-10-07T13:00:00-04:00", shipped_at: null, delivered_at: null }),
      shipment({ packed_at: "2026-10-07T16:00:00Z", shipped_at: null, delivered_at: null }),
      shipment({ packed_at: "2026-10-10T10:00:00Z", canceled_at: "2026-10-11T10:00:00Z" }),
    ],
  })
  const before = structuredClone(input)
  const steps = getTrackingProgress(input)
  assert.equal(steps[1].completedAt, "2026-10-07T13:00:00-04:00")
  assert.deepEqual(steps.map((step) => step.complete), [true, true, false, false])
  assert.deepEqual(input, before)
})

test("partial delivery does not imply every item was prepared or shipped", () => {
  const steps = getTrackingProgress(order({
    fulfillment_status: "partially_delivered",
    items: [item(1, 1, 1)],
    fulfillments: [shipment()],
  }))
  assert.deepEqual(steps.map((step) => step.complete), [true, false, false, false])
  assert.deepEqual(steps.map((step) => step.completedAt), [receivedAt, null, null, null])
})

test("complete quantities retain preparation and shipment during partial delivery", () => {
  const steps = getTrackingProgress(order({
    fulfillment_status: "partially_delivered",
    items: [item(3, 3, 1)],
    fulfillments: [
      shipment(),
      shipment({ shipped_at: "2026-10-08T16:00:00Z", delivered_at: null }),
    ],
  }))
  assert.deepEqual(steps.map((step) => step.complete), [true, true, true, false])
  assert.equal(steps[2].completedAt, "2026-10-08T16:00:00Z")
  assert.equal(steps[3].completedAt, null)
})

test("delivery dates belong to the last delivered active package", () => {
  const steps = getTrackingProgress(order({
    fulfillment_status: "delivered",
    items: [item(3, 3, 3)],
    fulfillments: [shipment(), shipment({ delivered_at: "2026-10-10T15:00:00Z" })],
  }))
  assert.ok(steps.every((step) => step.complete))
  assert.equal(steps[3].completedAt, "2026-10-10T15:00:00Z")
})

test("historical package creation is the preparation fallback when packed_at is missing", () => {
  const steps = getTrackingProgress(order({
    fulfillment_status: "fulfilled",
    fulfillments: [shipment({ packed_at: null, shipped_at: null, delivered_at: null })],
  }))
  assert.equal(steps[1].completedAt, "2026-10-07T10:00:00Z")
})

test("missing or invalid timestamps never fabricate a completion date", () => {
  for (const unknownDate of [null, "invalid", "2026-02-30T10:00:00Z"]) {
    const steps = getTrackingProgress(order({
      fulfillment_status: "shipped",
      items: [item(3, 3, 0)],
      fulfillments: [shipment(), shipment({ shipped_at: unknownDate, delivered_at: null })],
    }))
    assert.equal(steps[2].complete, true)
    assert.equal(steps[2].completedAt, null)
  }
})

test("unknown counters do not turn a partial status into completed milestones", () => {
  const steps = getTrackingProgress(order({
    fulfillment_status: "partially_delivered",
    items: [item(null, null, null)],
    fulfillments: [shipment()],
  }))
  assert.deepEqual(steps.map((step) => step.complete), [true, false, false, false])
})

test("empty, zero quantity and canceled histories do not invent later dates", () => {
  for (const items of [[], [{ quantity: 0, detail: null }]]) {
    const steps = getTrackingProgress(order({ items }))
    assert.deepEqual(steps.map((step) => step.complete), [true, false, false, false])
  }
  const canceled = getTrackingProgress(order({
    status: "canceled", fulfillment_status: "delivered", items: [item(3, 3, 3)],
    fulfillments: [shipment()],
  }))
  assert.deepEqual(canceled.map((step) => step.completedAt), [receivedAt, null, null, null])
  const noActivePackages = getTrackingProgress(order({
    fulfillment_status: "fulfilled", items: [item(3, 0, 0)],
    fulfillments: [shipment({ canceled_at: "2026-10-10T10:00:00Z" })],
  }))
  assert.equal(noActivePackages[1].completedAt, null)
})
