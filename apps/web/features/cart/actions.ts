"use server"

import { FetchError } from "@medusajs/js-sdk"
import type { HttpTypes as MercurHttpTypes } from "@mercurjs/types"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import {
  accountFormValues,
  normalizeUsPhone,
  validateAddress,
} from "@/features/account/validation"
import {
  CART_COOKIE,
  CART_FIELDS,
  RECEIPT_COOKIE,
  cartSdk,
  getPaymentProviders,
  getShippingOptions,
} from "./data"
import {
  hasShippingCoverage,
  isUsCart,
  parseQuantity,
  selectedShippingOptions,
} from "./presentation"
import { getReceiptOrderIds } from "./receipt"
import { cookieOptions, failure } from "./server-state"

export type CartActionState = {
  error?: string
  success?: string
  clientSecret?: string
  redirectTo?: string
  values?: Record<string, string>
}

function refreshCart() {
  revalidatePath("/", "layout")
}

async function currentCart(fields = CART_FIELDS) {
  const id = (await cookies()).get(CART_COOKIE)?.value
  if (!id || !/^cart_[a-zA-Z0-9]+$/.test(id))
    throw new Error("Tu carrito está vacío o venció. Vuelve al catálogo.")
  const sdk = await cartSdk()
  const { cart } = await sdk.store.cart.retrieve(id, { fields })
  if (!isUsCart(cart))
    throw new Error(
      "Esta tienda solo acepta compras en USD con entrega en Estados Unidos.",
    )
  return { sdk, cart }
}

export async function updateCartItemAction(
  _previous: CartActionState,
  form: FormData,
): Promise<CartActionState> {
  try {
    const { sdk, cart } = await currentCart(
      "id,currency_code,completed_at,region.countries.iso_2,items.id",
    )
    if (cart.completed_at)
      throw new Error("Este carrito ya se convirtió en pedido.")
    const id = String(form.get("item_id") ?? "")
    if (!cart.items?.some((item) => item.id === id))
      throw new Error("Ese producto ya no está en tu carrito.")
    if (form.get("remove") === "true")
      await sdk.store.cart.deleteLineItem(cart.id, id, { fields: "id" })
    else
      await sdk.store.cart.updateLineItem(
        cart.id,
        id,
        { quantity: parseQuantity(form.get("quantity")) },
        { fields: "id" },
      )
    revalidatePath("/cart")
    return { success: "Carrito actualizado." }
  } catch (error) {
    return failure(error)
  }
}

export async function saveAddressAction(
  _previous: CartActionState,
  form: FormData,
): Promise<CartActionState> {
  const values = accountFormValues(form)
  try {
    const errors = validateAddress({ ...values, address_name: "Entrega" })
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email ?? "") ||
      values.email.length > 254
    )
      errors.email = "Ingresa un email válido."
    if (Object.keys(errors).length)
      return { error: Object.values(errors)[0], values }
    const { sdk, cart } = await currentCart()
    const address = {
      first_name: values.first_name,
      last_name: values.last_name,
      address_1: values.address_1,
      address_2: values.address_2 || "",
      city: values.city,
      province: values.province,
      postal_code: values.postal_code,
      country_code: "us",
      phone: normalizeUsPhone(values.phone)!,
    }
    await sdk.store.cart.update(cart.id, {
      email: values.email,
      shipping_address: address,
      billing_address: address,
    })
    refreshCart()
    return { success: "Dirección guardada." }
  } catch (error) {
    return { ...failure(error), values }
  }
}

export async function saveShippingAction(
  _previous: CartActionState,
  form: FormData,
): Promise<CartActionState> {
  try {
    const { sdk, cart } = await currentCart()
    const selected = selectedShippingOptions(
      await getShippingOptions(cart.id),
      form,
      cart,
    )
    await sdk.store.cart.addShippingMethod(
      cart.id,
      selected.map((option_id) => ({ option_id })),
    )
    refreshCart()
    return { success: "Envíos seleccionados." }
  } catch (error) {
    return failure(error)
  }
}

export async function initializePaymentAction(
  _previous: CartActionState,
  form: FormData,
): Promise<CartActionState> {
  try {
    const { sdk, cart } = await currentCart()
    if (
      !cart.items?.length ||
      !cart.email ||
      cart.shipping_address?.country_code !== "us" ||
      !cart.shipping_methods?.length
    )
      throw new Error("Completa la dirección y los envíos antes de pagar.")
    const eligibleShipping = await getShippingOptions(cart.id)
    const selectedIds = new Set(
      cart.shipping_methods.map((method) => method.shipping_option_id),
    )
    const selectedShipping = Object.fromEntries(
      Object.entries(eligibleShipping).map(([seller, options]) => [
        seller,
        options.filter((option) => selectedIds.has(option.id)),
      ]),
    )
    if (!hasShippingCoverage(cart, selectedShipping))
      throw new Error(
        "Selecciona un envío disponible para todos los productos antes de pagar.",
      )
    const provider = form.get("provider_id")
    const providers = await getPaymentProviders(cart.region_id!)
    if (
      typeof provider !== "string" ||
      !provider.startsWith("pp_stripe_") ||
      !providers.some((entry) => entry.id === provider)
    )
      throw new Error("Selecciona un método de pago disponible.")
    const existing = cart.payment_collection?.payment_sessions?.find(
      (entry) =>
        entry.provider_id === provider &&
        !["canceled", "error"].includes(entry.status),
    )
    if (existing && typeof existing.data.client_secret === "string") {
      if (
        existing.amount !== cart.total ||
        existing.currency_code !== cart.currency_code
      ) {
        throw new Error(
          "El importe del carrito cambió. Revisa el pago existente antes de volver a intentarlo.",
        )
      }
      return { clientSecret: existing.data.client_secret }
    }
    const { payment_collection } =
      await sdk.store.payment.initiatePaymentSession(cart, {
        provider_id: provider,
      })
    const session = payment_collection.payment_sessions?.find(
      (entry) =>
        entry.provider_id === provider &&
        !["canceled", "error"].includes(entry.status),
    )
    const clientSecret = session?.data.client_secret
    if (typeof clientSecret !== "string" || !clientSecret)
      throw new Error("No pudimos iniciar el pago. Vuelve a intentarlo.")
    refreshCart()
    return { clientSecret }
  } catch (error) {
    return failure(error)
  }
}

export async function completeCheckoutAction(): Promise<CartActionState> {
  try {
    const cookieStore = await cookies()
    if (
      !cookieStore.get(CART_COOKIE)?.value &&
      cookieStore.get(RECEIPT_COOKIE)?.value
    )
      return { redirectTo: "/checkout/confirmation" }
    const { sdk, cart } = await currentCart()
    const result =
      await sdk.client.fetch<MercurHttpTypes.StoreCompleteCartResponse>(
        `/store/carts/${cart.id}/complete`,
        { method: "POST", query: { fields: "+orders.id" } },
      )
    if (result.type !== "order_group")
      return failure(
        new FetchError(result.error.message, result.error.type, 400),
      )
    const ids = getReceiptOrderIds(result.order_group, cart.id)
    const store = await cookies()
    store.set(RECEIPT_COOKIE, JSON.stringify(ids), {
      ...cookieOptions,
      maxAge: 60 * 60 * 24,
    })
    store.delete(CART_COOKIE)
    refreshCart()
    return { redirectTo: "/checkout/confirmation" }
  } catch (error) {
    return failure(error)
  }
}
