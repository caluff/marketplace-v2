import assert from "node:assert/strict"
import test from "node:test"
import type { HttpTypes } from "@medusajs/types"

import {
  listCheckoutAddresses,
  saveCheckoutAddress,
} from "./checkout-address.ts"

const values = {
  email: "buyer@example.com",
  first_name: "Jane",
  last_name: "Doe",
  address_1: "123 Main St",
  address_2: "",
  city: "Miami",
  province: "fl",
  postal_code: "33101",
  country_code: "us",
  phone: "+12025550123",
}

function savedAddress(id: string): HttpTypes.StoreCustomerAddress {
  return {
    ...values,
    id,
    address_name: "Entrega",
    is_default_shipping: false,
    is_default_billing: false,
    customer_id: "cus_buyer",
    company: null,
    metadata: null,
    created_at: "2026-09-09T00:00:00Z",
    updated_at: "2026-09-09T00:00:00Z",
  }
}

function fixture(initial: HttpTypes.StoreCustomerAddress[] = []) {
  const addresses = [...initial]
  const updates: HttpTypes.StoreUpdateCart[] = []
  const creates: HttpTypes.StoreCreateCustomerAddress[] = []
  const customerClient = {
    async listAddress(query?: { offset?: number; limit?: number }) {
      const offset = query?.offset ?? 0
      const limit = query?.limit ?? 100
      return {
        addresses: addresses.slice(offset, offset + limit),
        count: addresses.length,
        offset,
        limit,
      }
    },
    async createAddress(body: HttpTypes.StoreCreateCustomerAddress) {
      creates.push(body)
      addresses.push({
        ...body,
        id: "cuaddr_created",
      } as HttpTypes.StoreCustomerAddress)
      return { customer: { addresses } as HttpTypes.StoreCustomer }
    },
  }
  return {
    customerClient,
    updates,
    creates,
    updateCart: async (body: HttpTypes.StoreUpdateCart) => {
      updates.push(body)
    },
  }
}

test("saved selections use the customer's address instead of submitted address fields", async () => {
  const saved = savedAddress("cuaddr_owned")
  const context = fixture([saved])
  await saveCheckoutAddress({
    ...context,
    values: {
      email: values.email,
      address_id: saved.id,
      address_1: "Tampered",
    },
  })
  assert.equal(
    (context.updates[0].shipping_address as HttpTypes.StoreCartAddress)
      .address_1,
    values.address_1,
  )
  assert.deepEqual(
    context.updates[0].billing_address,
    context.updates[0].shipping_address,
  )
  assert.equal(context.creates.length, 0)
})

test("rejects an address absent from the authenticated account before changing the cart", async () => {
  const context = fixture()
  await assert.rejects(
    saveCheckoutAddress({
      ...context,
      values: { ...values, address_id: "cuaddr_foreign" },
    }),
    /ya no está en tu cuenta/,
  )
  assert.equal(context.updates.length, 0)
  assert.equal(context.creates.length, 0)
})

test("new addresses are saved to the profile once, including retries", async () => {
  const context = fixture()
  await saveCheckoutAddress({ ...context, values })
  await saveCheckoutAddress({ ...context, values })
  assert.equal(context.creates.length, 1)
  assert.equal(context.creates[0].is_default_shipping, true)
  assert.equal(context.creates[0].phone, values.phone)
})

test("guest addresses only update the cart and expired authenticated forms are rejected", async () => {
  const context = fixture()
  await saveCheckoutAddress({ ...context, customerClient: null, values })
  assert.equal(context.updates.length, 1)
  assert.equal(context.creates.length, 0)
  const expiredForms: Record<string, string>[] = [
    { customer_id: "cus_expired" },
    { address_id: "cuaddr_expired" },
  ]
  for (const extra of expiredForms) {
    await assert.rejects(
      saveCheckoutAddress({
        ...context,
        customerClient: null,
        values: { ...values, ...extra },
      }),
      /sesión venció/,
    )
  }
  assert.equal(context.updates.length, 1)
})

test("invalid addresses cannot update the cart or profile", async () => {
  const context = fixture()
  for (const extra of [
    { country_code: "ca" },
    { email: "invalid" },
    { phone: "123" },
    { postal_code: "invalid" },
  ]) {
    await assert.rejects(
      saveCheckoutAddress({ ...context, values: { ...values, ...extra } }),
    )
  }
  assert.equal(context.updates.length, 0)
  assert.equal(context.creates.length, 0)
})

test("profile failures are reported and a retry can finish saving", async () => {
  const context = fixture()
  const createAddress = context.customerClient.createAddress
  context.customerClient.createAddress = async () => {
    throw new Error("Unavailable")
  }
  await assert.rejects(
    saveCheckoutAddress({ ...context, values }),
    /no pudimos guardarla en tu perfil/,
  )
  assert.equal(context.updates.length, 1)
  context.customerClient.createAddress = createAddress
  await saveCheckoutAddress({ ...context, values })
  assert.equal(context.creates.length, 1)
})

test("cart update failures do not create profile addresses", async () => {
  const context = fixture()
  await assert.rejects(
    saveCheckoutAddress({
      ...context,
      values,
      updateCart: async () => {
        throw new Error("Cart unavailable")
      },
    }),
    /Cart unavailable/,
  )
  assert.equal(context.creates.length, 0)
})

test("loads addresses beyond the first API page", async () => {
  const addresses = Array.from({ length: 101 }, (_, index) =>
    savedAddress(`cuaddr_${index}`),
  )
  const context = fixture(addresses)
  assert.equal(
    (await listCheckoutAddresses(context.customerClient)).length,
    101,
  )
  await saveCheckoutAddress({
    ...context,
    values: { email: values.email, address_id: "cuaddr_100" },
  })
  assert.equal(context.updates.length, 1)
  assert.equal(context.creates.length, 0)
})
