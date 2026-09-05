import assert from "node:assert/strict"
import test from "node:test"

import {
  formatOrderAmount,
  formatOrderDate,
  formatOrderNumber,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  getShippingStatusLabel,
} from "./order-format"

test("order amounts preserve Medusa display units and the order currency", () => {
  assert.match(formatOrderAmount(49.99, "usd"), /49,99/)
  assert.match(formatOrderAmount(1500, "jpy"), /1[.,]500/)
  assert.equal(formatOrderAmount(Number.NaN, "usd"), "No disponible")
})

test("order dates remain stable across server time zones and reject invalid dates", () => {
  assert.match(
    formatOrderDate("2026-09-04T00:00:00Z"),
    /^4 de setiembre de 2026$/,
  )
  assert.equal(formatOrderDate("invalid"), "Fecha no disponible")
})

test("order identifiers prioritize the configured display number", () => {
  assert.equal(
    formatOrderNumber({
      id: "order_internal",
      display_id: 104,
      custom_display_id: "WEB-104",
    }),
    "WEB-104",
  )
  assert.equal(
    formatOrderNumber({ id: "order_internal", display_id: 104 }),
    "104",
  )
})

test("order states distinguish partial shipping and refund from completed orders", () => {
  assert.equal(
    getShippingStatusLabel("partially_shipped"),
    "Enviado parcialmente",
  )
  assert.equal(
    getPaymentStatusLabel("partially_refunded"),
    "Reembolsado parcialmente",
  )
  assert.equal(getOrderStatusLabel("canceled"), "Cancelado")
  assert.equal(getOrderStatusLabel("unknown"), "Estado por confirmar")
})
