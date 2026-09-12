import assert from "node:assert/strict"
import test from "node:test"
import type { HttpTypes } from "@medusajs/types"
import { paymentBillingDetails } from "../checkout/payment-presentation.ts"

test("Stripe receives the cart billing address and contact details instead of browser location", () => {
  const cart = {
    email: "buyer@example.com",
    billing_address: {
      first_name: "Jane",
      last_name: "Doe",
      address_1: "123 Main St",
      address_2: "Apt 2",
      city: "Miami",
      province: "fl",
      postal_code: "33101",
      country_code: "us",
      phone: "+12025550123",
    },
    shipping_address: { address_1: "Different delivery address" },
  } as HttpTypes.StoreCart
  assert.deepEqual(paymentBillingDetails(cart), {
    name: "Jane Doe",
    email: "buyer@example.com",
    phone: "+12025550123",
    address: {
      line1: "123 Main St",
      line2: "Apt 2",
      city: "Miami",
      state: "fl",
      postal_code: "33101",
      country: "US",
    },
  })
})

test("shipping supplies billing when a separate billing address is absent", () => {
  const cart = {
    email: "guest@example.com",
    shipping_address: {
      first_name: "Jane",
      address_1: "123 Main St",
      country_code: "us",
    },
  } as HttpTypes.StoreCart
  const billing = paymentBillingDetails(cart)
  assert.equal(billing.address.line1, "123 Main St")
  assert.equal(billing.address.country, "US")
  assert.equal(billing.name, "Jane")
  assert.equal(billing.email, "guest@example.com")
})
