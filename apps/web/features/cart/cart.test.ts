import assert from "node:assert/strict"
import test from "node:test"
import type { HttpTypes, ShippingOptionDTO } from "@medusajs/types"
import {
  hasShippingCoverage,
  isUsCart,
  parseQuantity,
  selectedShippingOptions,
  shippingGroups,
} from "./presentation.ts"

test("cart quantities accept whole units within the supported range", () => {
  assert.equal(parseQuantity("1"), 1)
  assert.equal(parseQuantity("20"), 20)
  assert.equal(parseQuantity("99"), 99)
})

test("cart quantities reject missing, fractional, signed and excessive values", () => {
  for (const value of [
    null,
    "",
    "0",
    "-1",
    "1.5",
    "1e2",
    "100",
    "999999",
    " 2 ",
  ]) {
    assert.throws(() => parseQuantity(value), /cantidad entre 1 y 99/)
  }
  assert.throws(
    () => parseQuantity(new File(["2"], "quantity.txt")),
    /cantidad entre 1 y 99/,
  )
})

test("a US region and USD are both required for an operational cart", () => {
  const cart = (currency: string, countries: string[]) =>
    ({
      currency_code: currency,
      region: { countries: countries.map((iso_2) => ({ iso_2 })) },
    }) as HttpTypes.StoreCart

  assert.equal(isUsCart(cart("usd", ["us"])), true)
  assert.equal(isUsCart(cart("eur", ["us"])), false)
  assert.equal(isUsCart(cart("usd", ["ca"])), false)
  assert.equal(isUsCart(cart("usd", [])), false)
})

function cartWithOffers(...offers: unknown[]): HttpTypes.StoreCart {
  return {
    items: offers.map((offer, index) => ({ id: `item_${index}`, offer })),
  } as unknown as HttpTypes.StoreCart
}

function option(id: string, profileId: string): ShippingOptionDTO {
  return { id, shipping_profile_id: profileId } as ShippingOptionDTO
}

const offerA = {
  seller_id: "seller_a",
  shipping_profile_id: "profile_standard",
}
const offerB = {
  seller_id: "seller_b",
  shipping_profile_id: "profile_standard",
}
const options = {
  seller_a: [
    option("ship_a", "profile_standard"),
    option("ship_a_express", "profile_standard"),
  ],
  seller_b: [option("ship_b", "profile_standard")],
}

function selectedForm(entries: Array<[string, string]>) {
  const form = new FormData()
  for (const [key, value] of entries) form.append(`shipping_${key}`, value)
  return form
}

test("shipping coverage narrows the offer relation before trusting seller and profile IDs", () => {
  for (const invalidOffer of [
    undefined,
    null,
    "offer_a",
    1,
    [],
    {},
    { seller_id: 12, shipping_profile_id: "profile_standard" },
    { seller_id: "seller_a" },
  ]) {
    assert.equal(
      hasShippingCoverage(cartWithOffers(invalidOffer), options),
      false,
    )
  }
  assert.equal(hasShippingCoverage(cartWithOffers(), options), false)
  assert.equal(
    hasShippingCoverage(cartWithOffers(offerA, offerB), options),
    true,
  )
})

test("an omitted seller or profile fails coverage even when another seller has shipping", () => {
  const cart = cartWithOffers(offerA, offerB)
  const partialOptions = { seller_a: options.seller_a }
  assert.equal(hasShippingCoverage(cart, partialOptions), false)
  assert.equal(
    hasShippingCoverage(
      cartWithOffers({ ...offerA, shipping_profile_id: "profile_large" }),
      options,
    ),
    false,
  )
  assert.throws(
    () =>
      selectedShippingOptions(
        partialOptions,
        selectedForm([["seller_a_profile_standard", "ship_a"]]),
        cart,
      ),
    /No hay un envío/,
  )
})

test("checkout selects one eligible shipping option for each required seller and profile", () => {
  const cart = cartWithOffers(offerA, offerA, offerB)
  const form = selectedForm([
    ["seller_a_profile_standard", "ship_a_express"],
    ["seller_b_profile_standard", "ship_b"],
  ])
  assert.deepEqual(selectedShippingOptions(options, form, cart), [
    "ship_a_express",
    "ship_b",
  ])
  assert.equal(shippingGroups(options, cart).length, 2)
})

test("unrelated shipping profiles are not selected or charged", () => {
  const extraOptions = {
    ...options,
    seller_a: [...options.seller_a, option("ship_large", "profile_large")],
  }
  const cart = cartWithOffers(offerA)
  const form = selectedForm([["seller_a_profile_standard", "ship_a"]])
  assert.deepEqual(selectedShippingOptions(extraOptions, form, cart), [
    "ship_a",
  ])
  assert.deepEqual(
    shippingGroups(extraOptions, cart).map((group) => group.profileId),
    ["profile_standard"],
  )
})

test("a shipping option belonging to another seller cannot satisfy the selected group", () => {
  const form = selectedForm([
    ["seller_a_profile_standard", "ship_b"],
    ["seller_b_profile_standard", "ship_b"],
  ])
  assert.throws(
    () =>
      selectedShippingOptions(options, form, cartWithOffers(offerA, offerB)),
    /Selecciona un envío/,
  )
  assert.throws(
    () =>
      selectedShippingOptions(options, new FormData(), cartWithOffers(offerA)),
    /Selecciona un envío/,
  )
})

test("duplicate choices for the same shipping group are rejected", () => {
  const form = selectedForm([
    ["seller_a_profile_standard", "ship_a"],
    ["seller_a_profile_standard", "ship_a_express"],
  ])
  assert.throws(
    () => selectedShippingOptions(options, form, cartWithOffers(offerA)),
    /Selecciona un envío/,
  )
})
