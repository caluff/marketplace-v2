import assert from "node:assert/strict"
import test from "node:test"
import type { HttpTypes } from "@medusajs/types"
import {
  formatPrice,
  getLowestOfferPrice,
  getOfferPrice,
  isOfferAvailable,
} from "./offers.ts"

function offer(amount: number | null, currency = "usd") {
  return {
    calculated_price: {
      calculated_amount: amount,
      original_amount: amount,
      currency_code: currency,
    } as HttpTypes.StoreCalculatedPrice,
  }
}

test("marketplace pricing uses calculated USD offers, preserves display units and zero prices", () => {
  assert.equal(getLowestOfferPrice([offer(29.99), offer(19.95)])?.amount, 19.95)
  assert.equal(getOfferPrice(offer(0))?.amount, 0)
  assert.match(formatPrice(29.99), /29[.,]99/)
  assert.equal(getLowestOfferPrice([offer(5, "eur"), offer(20)])?.amount, 20)
})

test("missing and invalid offer prices never become a fabricated purchasable price", () => {
  assert.equal(getOfferPrice({}), null)
  assert.equal(getOfferPrice(offer(null)), null)
  assert.equal(getOfferPrice(offer(Number.NaN)), null)
  assert.equal(getOfferPrice(offer(-1)), null)
  assert.equal(getLowestOfferPrice([]), null)
})

test("stock belongs to the selected offer and respects explicit backorders", () => {
  assert.equal(
    isOfferAvailable({
      manage_inventory: true,
      allow_backorder: false,
      inventory_quantity: 0,
    }),
    false,
  )
  assert.equal(
    isOfferAvailable({ manage_inventory: true, allow_backorder: false }),
    false,
  )
  assert.equal(
    isOfferAvailable({
      manage_inventory: true,
      allow_backorder: false,
      inventory_quantity: 2,
    }),
    true,
  )
  assert.equal(
    isOfferAvailable({
      manage_inventory: true,
      allow_backorder: true,
      inventory_quantity: 0,
    }),
    true,
  )
  assert.equal(
    isOfferAvailable({ manage_inventory: false, allow_backorder: false }),
    true,
  )
})
