import assert from "node:assert/strict"
import test from "node:test"
import { getOrderProgress } from "./order-progress"

test("pickup has no shipping milestone and preparation does not mean collected", () => {
  const steps = getOrderProgress(
    {
      status: "pending",
      fulfillment_status: "fulfilled",
      created_at: "2026-10-08T12:00:00Z",
    },
    true,
  )
  assert.deepEqual(steps, [
    { label: "Pedido recibido", complete: true },
    { label: "Listo para recoger", complete: true },
    { label: "Recogido", complete: false },
  ])
})

test("pickup completes on native order completion without shipment or delivery counters", () => {
  const steps = getOrderProgress(
    {
      status: "completed",
      fulfillment_status: "fulfilled",
      created_at: "2026-10-08T12:00:00Z",
    },
    true,
  )
  assert.ok(steps.every((step) => step.complete))
})

test("partial preparation and canceled pickup do not claim that collection is ready", () => {
  for (const input of [
    {
      status: "pending" as const,
      fulfillment_status: "partially_fulfilled" as const,
    },
    { status: "canceled" as const, fulfillment_status: "delivered" as const },
  ]) {
    assert.deepEqual(
      getOrderProgress(
        { ...input, created_at: "2026-10-08T12:00:00Z" },
        true,
      ).map((step) => step.complete),
      [true, false, false],
    )
  }
})

test("delivery orders keep the existing four-stage shipping flow", () => {
  const steps = getOrderProgress({
    status: "pending",
    fulfillment_status: "fulfilled",
    created_at: "2026-10-08T12:00:00Z",
  })
  assert.deepEqual(
    steps.map((step) => step.label),
    ["Pedido recibido", "Preparado", "Enviado", "Entregado"],
  )
  assert.deepEqual(
    steps.map((step) => step.complete),
    [true, true, false, false],
  )
})
