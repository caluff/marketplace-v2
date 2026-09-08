"use client"

import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateCartItemAction } from "../actions"
import { formatMoney } from "../presentation"

export function CartItem({
  item,
  currency,
}: {
  item: HttpTypes.StoreCartLineItem
  currency: string
}) {
  const [state, action, pending] = useActionState(updateCartItemAction, {})
  return (
    <article className="border-b border-border py-6 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">
            {item.product_handle ? (
              <Link
                href={`/products/${encodeURIComponent(item.product_handle)}`}
                className="hover:underline"
              >
                {item.product_title ?? item.title}
              </Link>
            ) : (
              item.title
            )}
          </h2>
          <p className="mt-1 font-sans text-sm text-muted-foreground">
            {item.variant_title}
          </p>
          <p className="mt-2 font-sans text-sm">
            {formatMoney(item.unit_price, currency)} por unidad
          </p>
        </div>
        <p className="shrink-0 font-sans font-bold">
          {formatMoney(item.total ?? item.unit_price * item.quantity, currency)}
        </p>
      </div>
      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="item_id" value={item.id} />
        <label
          className="font-sans text-xs font-bold"
          htmlFor={`quantity-${item.id}`}
        >
          Cantidad
          <Input
            key={item.quantity}
            id={`quantity-${item.id}`}
            name="quantity"
            type="number"
            min={1}
            max={99}
            defaultValue={item.quantity}
            className="mt-1 h-11 w-24"
            disabled={pending}
          />
        </label>
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          className="min-h-11"
        >
          {pending ? "Actualizando…" : "Actualizar"}
        </Button>
        <Button
          type="submit"
          name="remove"
          value="true"
          variant="ghost"
          disabled={pending}
          className="min-h-11"
        >
          Eliminar
        </Button>
        <p
          role={state.error ? "alert" : "status"}
          className={
            state.error
              ? "w-full font-sans text-sm text-destructive"
              : "sr-only"
          }
        >
          {state.error ?? state.success}
        </p>
      </form>
    </article>
  )
}
