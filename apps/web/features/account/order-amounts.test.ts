import assert from "node:assert/strict"
import { test } from "node:test"
import { getOrderAmounts, getOrderItemQuantities } from "./order-amounts"

test("receiving a return reduces the order total without claiming a refund or a smaller charge", () => {
  assert.deepEqual(
    getOrderAmounts({
      total: 47.15,
      summary: { paid_total: 68.6, refunded_total: 0, transaction_total: 68.6 },
    }),
    { currentTotal: 47.15, chargedTotal: 68.6, refundedTotal: 0, netChargedTotal: 68.6 },
  )
})

test("a partial or full refund keeps gross charges and net transactions distinct", () => {
  for (const [refund, net] of [[21.45, 47.15], [68.6, 0]]) {
    assert.deepEqual(
      getOrderAmounts({
        total: 0,
        summary: { paid_total: 68.6, refunded_total: refund, transaction_total: net },
      }),
      { currentTotal: 0, chargedTotal: 68.6, refundedTotal: refund, netChargedTotal: net },
    )
  }
})

test("authorization does not claim that the order total was collected", () => {
  assert.deepEqual(
    getOrderAmounts({
      total: 68.6,
      summary: { paid_total: 0, refunded_total: 0, transaction_total: 0 },
    }),
    { currentTotal: 68.6, chargedTotal: 0, refundedTotal: 0, netChargedTotal: 0 },
  )
  assert.deepEqual(getOrderAmounts({ total: 68.6 }), {
    currentTotal: 68.6, chargedTotal: null, refundedTotal: null, netChargedTotal: null,
  })
})

test("received and dismissed return quantities match the remaining native line total", () => {
  assert.deepEqual(
    getOrderItemQuantities({ quantity: 3, detail: { return_received_quantity: 1, return_dismissed_quantity: 0 } }),
    { orderedQuantity: 3, returnedQuantity: 1, currentQuantity: 2 },
  )
  assert.deepEqual(
    getOrderItemQuantities({ quantity: 3, detail: { return_received_quantity: 2, return_dismissed_quantity: 1 } }),
    { orderedQuantity: 3, returnedQuantity: 3, currentQuantity: 0 },
  )
})

test("a return request alone does not reduce the current line quantity", () => {
  assert.deepEqual(
    getOrderItemQuantities({ quantity: 3, detail: { return_requested_quantity: 3 } }),
    { orderedQuantity: 3, returnedQuantity: 0, currentQuantity: 3 },
  )
})
