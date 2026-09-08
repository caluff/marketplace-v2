"use server"

import { FetchError } from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import type { HttpTypes as MercurHttpTypes } from "@mercurjs/types"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { getStorefrontRegion } from "@/lib/medusa"
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

export type CartActionState = {
  error?: string
  success?: string
  clientSecret?: string
  redirectTo?: string
  values?: Record<string, string>
}
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

function failure(error: unknown): CartActionState {
  if (
    error instanceof Error &&
    ["TimeoutError", "AbortError"].includes(error.name)
  )
    return {
      error:
        "La operación está demorando. Consulta el carrito o el estado del pedido antes de repetirla.",
    }
  if (error instanceof FetchError) {
    if (error.status === 401)
      return { error: "Tu sesión venció. Vuelve a ingresar para continuar." }
    if (/stock|inventory/i.test(error.message))
      return {
        error: "No hay stock suficiente. Revisa las cantidades del carrito.",
      }
    if (/shipping|delivery/i.test(error.message))
      return {
        error: "Revisa el envío: debe cubrir todos los productos del carrito.",
      }
    if (
      /payout|sale.readiness|stripe.connect|Stripe setup|seller.*ready|payment.*configured/i.test(
        error.message,
      )
    )
      return {
        error:
          "Un vendedor todavía no está habilitado para cobrar. El carrito se conserva para que puedas intentarlo más tarde.",
      }
    if (/paused|not.*sale|unavailable/i.test(error.message))
      return {
        error:
          "Un producto ya no está disponible para la venta. Revisa el carrito.",
      }
    if (/payment|authorize/i.test(error.message))
      return {
        error:
          "El pago todavía no está confirmado. Comprueba su estado antes de volver a pagar.",
      }
    return {
      error:
        "No pudimos completar la operación. Revisa el carrito y vuelve a intentarlo.",
    }
  }
  return {
    error:
      error instanceof Error
        ? error.message
        : "No pudimos completar la operación.",
  }
}

function refreshCart() {
  revalidatePath("/", "layout")
}

async function currentCart() {
  const id = (await cookies()).get(CART_COOKIE)?.value
  if (!id || !/^cart_[a-zA-Z0-9]+$/.test(id))
    throw new Error("Tu carrito está vacío o venció. Vuelve al catálogo.")
  const sdk = await cartSdk()
  const { cart } = await sdk.store.cart.retrieve(id, { fields: CART_FIELDS })
  if (!isUsCart(cart))
    throw new Error(
      "Esta tienda solo acepta compras en USD con entrega en Estados Unidos.",
    )
  return { sdk, cart }
}

export async function addToCartAction(
  _previous: CartActionState,
  form: FormData,
): Promise<CartActionState> {
  try {
    const offerId = form.get("offer_id")
    if (typeof offerId !== "string" || !/^offer_[a-zA-Z0-9]+$/.test(offerId))
      throw new Error("Selecciona una oferta del producto.")
    const quantity = parseQuantity(form.get("quantity"))
    const sdk = await cartSdk()
    const store = await cookies()
    let cart: HttpTypes.StoreCart | undefined
    const id = store.get(CART_COOKIE)?.value
    if (id && /^cart_[a-zA-Z0-9]+$/.test(id)) {
      try {
        cart = (await sdk.store.cart.retrieve(id, { fields: CART_FIELDS })).cart
      } catch (error) {
        if (!(error instanceof FetchError && error.status === 404)) throw error
      }
    }
    if (!cart || cart.completed_at) {
      const region = await getStorefrontRegion()
      if (!region)
        throw new Error(
          "Las compras para Estados Unidos todavía no están disponibles.",
        )
      cart = (
        await sdk.store.cart.create(
          { region_id: region.id },
          { fields: CART_FIELDS },
        )
      ).cart
      store.set(CART_COOKIE, cart.id, cookieOptions)
    }
    if (!isUsCart(cart))
      throw new Error("Este carrito no corresponde a Estados Unidos y USD.")
    await sdk.client.fetch<HttpTypes.StoreCartResponse>(
      `/store/carts/${cart.id}/line-items`,
      { method: "POST", body: { offer_id: offerId, quantity } },
    )
    refreshCart()
    return { success: "Producto añadido al carrito." }
  } catch (error) {
    return failure(error)
  }
}

export async function updateCartItemAction(
  _previous: CartActionState,
  form: FormData,
): Promise<CartActionState> {
  try {
    const { sdk, cart } = await currentCart()
    if (cart.completed_at)
      throw new Error("Este carrito ya se convirtió en pedido.")
    const id = String(form.get("item_id") ?? "")
    if (!cart.items?.some((item) => item.id === id))
      throw new Error("Ese producto ya no está en tu carrito.")
    if (form.get("remove") === "true")
      await sdk.store.cart.deleteLineItem(cart.id, id)
    else
      await sdk.store.cart.updateLineItem(cart.id, id, {
        quantity: parseQuantity(form.get("quantity")),
      })
    refreshCart()
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
    // Mercur's published group DTO omits graph relations; narrow the requested
    // order IDs before persisting the receipt capability for guest checkout.
    const group: unknown = result.order_group
    if (
      !group ||
      typeof group !== "object" ||
      !("orders" in group) ||
      !Array.isArray(group.orders)
    )
      throw new Error(
        "El pedido se creó, pero no pudimos cargar su comprobante. Vuelve a consultar el estado.",
      )
    const ids = group.orders.map((order: unknown) =>
      order && typeof order === "object" && "id" in order ? order.id : null,
    )
    if (
      !ids.length ||
      ids.length > 30 ||
      !ids.every(
        (id) => typeof id === "string" && /^order_[a-zA-Z0-9]+$/.test(id),
      )
    )
      throw new Error(
        "No pudimos recuperar los pedidos. Consulta el estado nuevamente.",
      )
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
