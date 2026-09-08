"use client"

import type { HttpTypes, ShippingOptionDTO } from "@medusajs/types"
import type { HttpTypes as MercurHttpTypes } from "@mercurjs/types"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  saveShippingAction,
  type CartActionState,
} from "@/features/cart/actions"
import {
  formatMoney,
  hasShippingCoverage,
  shippingGroups,
} from "@/features/cart/presentation"

function shippingPrice(option: ShippingOptionDTO, currency: string) {
  if (
    "amount" in option &&
    typeof option.amount === "number" &&
    Number.isFinite(option.amount)
  ) {
    return formatMoney(option.amount, currency)
  }
  return "Se calcula al continuar"
}

export function ShippingStep({
  cart,
  options,
}: {
  cart: HttpTypes.StoreCart
  options: MercurHttpTypes.StoreSellerShippingOptionsResponse["shipping_options"]
}) {
  const router = useRouter()
  const groups = shippingGroups(options, cart)
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      groups.map((group) => [
        group.key,
        group.choices.find((choice) =>
          cart.shipping_methods?.some(
            (method) => method.shipping_option_id === choice.id,
          ),
        )?.id ?? "",
      ]),
    ),
  )
  const [state, action, pending] = useActionState(
    async (previous: CartActionState, formData: FormData) => {
      try {
        const result = await saveShippingAction(previous, formData)
        if (!result.error) {
          router.replace("/checkout?step=payment")
        }
        return result
      } catch {
        return { error: "No pudimos guardar el envío. Inténtalo nuevamente." }
      }
    },
    {},
  )
  const hasCoverage = hasShippingCoverage(cart, options)

  return (
    <form action={action} className="space-y-6" aria-busy={pending}>
      <h2 className="text-2xl font-medium tracking-tight">Método de envío</h2>
      {hasCoverage ? (
        groups.map((group, index) => (
          <fieldset key={group.key} disabled={pending} className="space-y-3">
            <legend className="mb-3 text-sm font-semibold">
              {groups.length > 1
                ? `Envío ${index + 1}`
                : "Opciones disponibles"}
            </legend>
            {group.choices.map((option) => (
              <label
                key={option.id}
                className="flex min-h-16 cursor-pointer items-start gap-3 border border-border p-4 transition-colors has-checked:border-foreground has-checked:bg-muted/40 has-disabled:cursor-not-allowed has-disabled:opacity-60"
              >
                <input
                  type="radio"
                  name={`shipping_${group.key}`}
                  value={option.id}
                  required
                  checked={selected[group.key] === option.id}
                  onChange={() =>
                    setSelected((current) => ({
                      ...current,
                      [group.key]: option.id,
                    }))
                  }
                  className="mt-1 size-4 shrink-0 accent-brand-accent"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {option.name}
                  </span>
                  {option.type?.description ? (
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {option.type.description}
                    </span>
                  ) : null}
                </span>
                <span className="text-right text-sm font-medium">
                  {shippingPrice(option, cart.currency_code)}
                </span>
              </label>
            ))}
          </fieldset>
        ))
      ) : (
        <p
          role="status"
          className="border border-border bg-muted/30 p-5 text-sm"
        >
          No hay opciones de envío para todos los productos a esta dirección.
          Cambia la dirección o revisa tu carrito.
        </p>
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="outline">
          <Link href="/checkout?step=address">Editar dirección</Link>
        </Button>
        <Button type="submit" disabled={pending || !hasCoverage}>
          {pending ? "Guardando…" : "Continuar al pago"}
        </Button>
      </div>
    </form>
  )
}
