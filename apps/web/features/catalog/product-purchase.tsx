"use client"

import type { HttpTypes } from "@medusajs/types"
import { LoaderCircle, ShoppingBag } from "lucide-react"
import Link from "next/link"
import { useActionState, useState } from "react"
import { Button } from "@/components/ui/button"
import type { AddCartItemResult } from "@/features/cart/add-item"
import { submitCartItem } from "@/features/cart/add-item-client"
import { notifyCartUpdated } from "@/features/cart/cart-events"
import {
  formatPrice,
  getLowestOfferPrice,
  getOfferPrice,
  isOfferAvailable,
  type StorefrontOffer,
} from "@/features/catalog/offers"
import { cn } from "@/lib/utils"

export function ProductPurchase({
  variants,
  offers,
  hasRegion,
}: {
  variants: HttpTypes.StoreProductVariant[]
  offers: StorefrontOffer[]
  hasRegion: boolean
}) {
  const [variantId, setVariantId] = useState(
    variants.length === 1 ? variants[0].id : "",
  )
  const [offerId, setOfferId] = useState("")
  const matchingOffers = offers.filter(
    (offer) => offer.variant_id === variantId,
  )
  const selectedOffer =
    matchingOffers.find((offer) => offer.id === offerId) ??
    (matchingOffers.length === 1 ? matchingOffers[0] : undefined)
  const price = selectedOffer
    ? getOfferPrice(selectedOffer)
    : getLowestOfferPrice(variantId ? matchingOffers : offers)
  const available = Boolean(
    selectedOffer &&
    getOfferPrice(selectedOffer) &&
    isOfferAvailable(selectedOffer),
  )
  const [state, action, isPending] = useActionState<
    AddCartItemResult | null,
    FormData
  >(async (_previous, form) => {
    const result = await submitCartItem(form)
    if (typeof result.cartCount === "number") notifyCartUpdated(result.cartCount)
    return result
  }, null)
  const error = state && "error" in state ? state.error : undefined
  const success = state && "success" in state ? state.success : undefined

  return (
    <div className="mt-8">
      <div className="border-y border-border py-6" aria-live="polite">
        <p className="font-sans text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
          {selectedOffer ? "Precio" : "Desde"}
        </p>
        <p className="mt-2 font-sans text-3xl font-black tracking-tight">
          {price ? formatPrice(price.amount) : "Precio no disponible en USD"}
        </p>
        {price &&
        price.originalAmount !== null &&
        price.originalAmount > price.amount ? (
          <p className="mt-2 font-sans text-muted-foreground line-through">
            {formatPrice(price.originalAmount)}
          </p>
        ) : null}
        <p className="mt-3 font-sans text-sm text-muted-foreground">
          Envíos únicamente a Estados Unidos. El envío y los impuestos se
          calculan al finalizar la compra.
        </p>
      </div>

      {!hasRegion ? (
        <p
          role="status"
          className="mt-6 border border-border bg-muted p-4 font-sans text-sm"
        >
          Las compras estarán disponibles cuando la tienda habilite los precios
          para Estados Unidos en USD.
        </p>
      ) : null}

      {variants.length > 1 ? (
        <fieldset className="mt-7">
          <legend className="mb-3 font-sans text-sm font-bold">Variante</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                aria-pressed={variantId === variant.id}
                onClick={() => {
                  setVariantId(variant.id)
                  setOfferId("")
                }}
                className={cn(
                  "min-h-11 border px-4 py-2 font-sans text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40",
                  variantId === variant.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground",
                )}
              >
                {variant.options?.map((option) => option.value).join(" / ") ||
                  variant.title}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {variantId && matchingOffers.length > 0 ? (
        <fieldset className="mt-7">
          <legend className="mb-3 font-sans text-sm font-bold">
            Vendido por
          </legend>
          <div className="space-y-2">
            {matchingOffers.map((offer) => {
              const offerPrice = getOfferPrice(offer)
              return (
                <label
                  key={offer.id}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-3 border p-4 font-sans text-sm",
                    selectedOffer?.id === offer.id
                      ? "border-foreground"
                      : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="seller_offer"
                    value={offer.id}
                    checked={selectedOffer?.id === offer.id}
                    onChange={() => setOfferId(offer.id)}
                    className="size-4 accent-current"
                  />
                  <span className="flex-1 font-semibold">
                    {offer.seller?.name ?? "Tienda"}
                  </span>
                  <span>
                    {offerPrice
                      ? formatPrice(offerPrice.amount)
                      : "Sin precio en USD"}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      <div
        className="mt-5 min-h-6 font-sans text-sm text-muted-foreground"
        aria-live="polite"
      >
        {!variantId
          ? "Selecciona una variante para continuar."
          : !matchingOffers.length
            ? "Esta variante no está disponible para comprar."
            : !selectedOffer
              ? "Selecciona una tienda para continuar."
              : available
                ? selectedOffer.allow_backorder
                  ? "Disponible para pedido."
                  : "Disponible"
                : getOfferPrice(selectedOffer)
                  ? "Sin stock por el momento."
                  : "Esta tienda todavía no tiene un precio disponible en USD."}
      </div>

      <form
        action={action}
        className="mt-6 space-y-4"
        key={selectedOffer?.id ?? variantId}
      >
        <input type="hidden" name="offer_id" value={selectedOffer?.id ?? ""} />
        <label
          className="block font-sans text-sm font-bold"
          htmlFor="product-quantity"
        >
          Cantidad
        </label>
        <input
          id="product-quantity"
          name="quantity"
          type="number"
          min={1}
          step={1}
          max={
            selectedOffer?.manage_inventory && !selectedOffer.allow_backorder
              ? Math.max(1, selectedOffer.inventory_quantity ?? 0)
              : undefined
          }
          defaultValue={1}
          required
          disabled={!available || isPending}
          className="h-11 w-24 border border-input bg-background px-3 font-sans outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        />
        <Button
          type="submit"
          variant="accent"
          size="lg"
          disabled={!available || !hasRegion || isPending}
          className="w-full"
        >
          {isPending ? (
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <ShoppingBag className="size-5" aria-hidden="true" />
          )}
          {isPending ? "Agregando…" : "Agregar al carrito"}
        </Button>
        {error ? (
          <p role="alert" className="font-sans text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="font-sans text-sm text-success">
            {success}{" "}
            <Link href="/cart" className="underline underline-offset-4">
              Ver carrito
            </Link>
          </p>
        ) : null}
      </form>
    </div>
  )
}
