import { FetchError } from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import type { HttpTypes as MercurHttpTypes } from "@mercurjs/types"
import { cookies } from "next/headers"
import { cache } from "react"
import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk"

export const CART_COOKIE = "marketplace_cart"
export const RECEIPT_COOKIE = "marketplace_receipt"
export const CART_FIELDS =
  "*items,*items.variant,*items.variant.options,*items.offer,*region,*region.countries,*shipping_address,*billing_address,*shipping_methods,*payment_collection,*payment_collection.payment_sessions"

export async function cartSdk() {
  const sdk = createCustomerSdk(await getCustomerSessionToken())
  if (!sdk) throw new Error("La tienda no está disponible en este momento.")
  const transport = sdk.client.fetch_
  sdk.client.fetch_ = (input, init) =>
    transport(input, {
      ...init,
      cache: "no-store",
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    })
  return sdk
}

export const getCheckoutCart = cache(
  async (): Promise<HttpTypes.StoreCart | null> => {
    const id = (await cookies()).get(CART_COOKIE)?.value
    if (!id || !/^cart_[a-zA-Z0-9]+$/.test(id)) return null
    try {
      const { cart } = await (
        await cartSdk()
      ).store.cart.retrieve(
        id,
        { fields: CART_FIELDS },
        { "cache-control": "no-cache" },
      )
      return cart
    } catch (error) {
      if (error instanceof FetchError && error.status === 404) return null
      throw error
    }
  },
)

export const getCart = cache(async (): Promise<HttpTypes.StoreCart | null> => {
  const cart = await getCheckoutCart()
  return cart?.completed_at ? null : cart
})

export async function getShippingOptions(cartId: string) {
  const { shipping_options } = await (
    await cartSdk()
  ).client.fetch<MercurHttpTypes.StoreSellerShippingOptionsResponse>(
    "/store/shipping-options",
    { query: { cart_id: cartId } },
  )
  return shipping_options
}

export async function getPaymentProviders(regionId: string) {
  const { payment_providers } = await (
    await cartSdk()
  ).store.payment.listPaymentProviders({ region_id: regionId })
  return payment_providers
}

export async function getReceiptOrders(): Promise<HttpTypes.StoreOrder[]> {
  const value = (await cookies()).get(RECEIPT_COOKIE)?.value
  if (!value) return []
  let ids: unknown
  try {
    ids = JSON.parse(value)
  } catch {
    return []
  }
  if (
    !Array.isArray(ids) ||
    ids.length > 30 ||
    !ids.every(
      (id) => typeof id === "string" && /^order_[a-zA-Z0-9]+$/.test(id),
    )
  )
    return []
  const sdk = await cartSdk()
  return Promise.all(
    ids.map(async (id) => (await sdk.store.order.retrieve(id)).order),
  )
}
