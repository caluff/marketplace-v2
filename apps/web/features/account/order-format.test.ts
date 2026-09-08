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
  assert.equal(formatOrderDate("2026-02-30T12:00:00Z"), "Fecha no disponible")
  assert.equal(formatOrderDate(new Date(NaN)), "Fecha no disponible")
  assert.equal(
    formatOrderDate("2026-09-03T20:00:00-04:00"),
    formatOrderDate("2026-09-04T00:00:00Z"),
  )
  const date = new Date("2024-02-29T23:00:00Z")
  assert.match(formatOrderDate(date), /^29 de febrero de 2024$/)
  assert.equal(date.toISOString(), "2024-02-29T23:00:00.000Z")
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
