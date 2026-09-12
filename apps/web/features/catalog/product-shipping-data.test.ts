import assert from "node:assert/strict"
import test from "node:test"
import {
  productShippingMethods,
  requestProductShipping,
} from "./product-shipping-data"

test("shipping preview keeps the selected seller/profile and public US methods without quoting prices", () => {
  const base = {
    id: "so_a",
    name: "Standard",
    shipping_profile_id: "sp_a",
    seller: { id: "sel_a" },
    provider: { is_enabled: true },
    service_zone: { geo_zones: [{ country_code: "us" }] },
    type: { label: "Standard", description: "Ground shipping" },
    rules: [],
  }
  assert.deepEqual(
    productShippingMethods({
      id: "offer_a",
      seller_id: "sel_a",
      shipping_profile_id: "sp_a",
      shipping_profile: {
        shipping_options: [
          base,
          { ...base, id: "foreign", seller: { id: "sel_b" } },
          { ...base, id: "wrong-profile", shipping_profile_id: "sp_b" },
          { ...base, id: "disabled", provider: { is_enabled: false } },
          {
            ...base,
            id: "foreign-country",
            service_zone: { geo_zones: [{ country_code: "ca" }] },
          },
          {
            ...base,
            id: "return",
            rules: [
              {
                attribute: "is_return",
                operator: "eq",
                value: { value: "true" },
              },
            ],
          },
          {
            ...base,
            id: "hidden",
            rules: [
              {
                attribute: "enabled_in_store",
                operator: "eq",
                value: { value: "false" },
              },
            ],
          },
        ],
      },
    }),
    [{ id: "so_a", name: "Standard", type: base.type }],
  )
})

test("shipping preview accepts native in/nin rules and rejects malformed identifiers before transport", async () => {
  assert.deepEqual(
    productShippingMethods({
      id: "offer_a",
      seller_id: "sel_a",
      shipping_profile_id: "sp_a",
      shipping_profile: {
        shipping_options: [
          {
            id: "so_a",
            name: "Delivery",
            shipping_profile_id: "sp_a",
            type: null,
            seller: { id: "sel_a" },
            provider: { is_enabled: true },
            service_zone: { geo_zones: [{ country_code: "US" }] },
            rules: [
              {
                attribute: "enabled_in_store",
                operator: "in",
                value: { value: ["true"] },
              },
              {
                attribute: "is_return",
                operator: "nin",
                value: { value: ["true"] },
              },
            ],
          },
        ],
      },
    }),
    [{ id: "so_a", name: "Delivery", type: null }],
  )
  await assert.rejects(
    requestProductShipping("../admin", AbortSignal.timeout(1000)),
    /oferta válida/,
  )
})
