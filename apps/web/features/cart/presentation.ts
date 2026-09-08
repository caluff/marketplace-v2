import type { HttpTypes, ShippingOptionDTO } from "@medusajs/types"

export function formatMoney(amount: number, currency = "usd") {
  return new Intl.NumberFormat("es-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount)
}

export function parseQuantity(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value : ""
  if (!/^\d{1,2}$/.test(text) || Number(text) < 1 || Number(text) > 99) {
    throw new Error("Selecciona una cantidad entre 1 y 99.")
  }
  return Number(text)
}

export function isUsCart(cart: HttpTypes.StoreCart) {
  return (
    cart.currency_code === "usd" &&
    Boolean(cart.region?.countries?.some((country) => country.iso_2 === "us"))
  )
}

export function shippingGroups(
  options: Record<string, ShippingOptionDTO[]>,
  cart?: HttpTypes.StoreCart,
) {
  return Object.entries(options).flatMap(([sellerId, entries]) => {
    const profiles = Map.groupBy(
      entries,
      (option) => option.shipping_profile_id,
    )
    return [...profiles.entries()]
      .filter(
        ([profileId]) =>
          !cart ||
          cart.items?.some((item) => {
            const value: unknown = item
            if (!value || typeof value !== "object" || !("offer" in value))
              return false
            const offer = value.offer
            return (
              offer &&
              typeof offer === "object" &&
              "seller_id" in offer &&
              "shipping_profile_id" in offer &&
              offer.seller_id === sellerId &&
              offer.shipping_profile_id === profileId
            )
          }),
      )
      .map(([profileId, choices]) => ({
        key: `${sellerId}_${profileId}`,
        sellerId,
        profileId,
        choices,
      }))
  })
}

export function hasShippingCoverage(
  cart: HttpTypes.StoreCart,
  options: Record<string, ShippingOptionDTO[]>,
) {
  if (!cart.items?.length) return false
  return cart.items.every((item) => {
    const value: unknown = item
    if (!value || typeof value !== "object" || !("offer" in value)) return false
    const offer = value.offer
    if (
      !offer ||
      typeof offer !== "object" ||
      !("seller_id" in offer) ||
      !("shipping_profile_id" in offer)
    )
      return false
    return (
      typeof offer.seller_id === "string" &&
      typeof offer.shipping_profile_id === "string" &&
      Boolean(
        options[offer.seller_id]?.some(
          (option) => option.shipping_profile_id === offer.shipping_profile_id,
        ),
      )
    )
  })
}

export function selectedShippingOptions(
  options: Record<string, ShippingOptionDTO[]>,
  form: FormData,
  cart?: HttpTypes.StoreCart,
) {
  const groups = shippingGroups(options, cart)
  if (!groups.length || (cart && !hasShippingCoverage(cart, options))) {
    throw new Error(
      "No hay un envío disponible para todos los productos de tu carrito.",
    )
  }
  return groups.map((group) => {
    const values = form.getAll(`shipping_${group.key}`)
    const id = values[0]
    if (
      values.length !== 1 ||
      typeof id !== "string" ||
      !group.choices.some((option) => option.id === id)
    ) {
      throw new Error("Selecciona un envío para cada grupo de productos.")
    }
    return id
  })
}
