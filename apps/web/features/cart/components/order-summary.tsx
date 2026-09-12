import type { HttpTypes } from "@medusajs/types"
import type { ReactNode } from "react"
import { formatMoney } from "../presentation"

export function OrderSummary({
  cart,
  children,
}: {
  cart: HttpTypes.StoreCart
  children?: ReactNode
}) {
  const money = (amount: number) => formatMoney(amount, cart.currency_code)
  const itemCount =
    cart.items?.reduce((total, item) => total + item.quantity, 0) ?? 0
  return (
    <section
      aria-label="Resumen del pedido"
      className="border border-border bg-card p-6"
    >
      <p className="font-sans text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">
        Resumen
      </p>
      <h2 className="mt-2 text-2xl font-semibold">Tu pedido</h2>
      <dl className="mt-6 space-y-4 border-t border-border pt-5 font-sans text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            Subtotal ({itemCount} {itemCount === 1 ? "producto" : "productos"})
          </dt>
          <dd className="font-medium tabular-nums">
            {money(cart.item_subtotal ?? cart.subtotal ?? 0)}
          </dd>
        </div>
        {cart.discount_total ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Descuentos</dt>
            <dd className="font-medium tabular-nums">
              −{money(cart.discount_total)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Envío</dt>
          <dd className="font-medium tabular-nums">
            {cart.shipping_methods?.length
              ? money(cart.shipping_subtotal ?? 0)
              : "A calcular"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Impuestos</dt>
          <dd className="font-medium tabular-nums">
            {cart.shipping_address?.address_1
              ? money(cart.tax_total ?? 0)
              : "A calcular"}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-foreground pt-5 text-lg font-black">
          <dt>Total (USD)</dt>
          <dd className="tabular-nums">{money(cart.total ?? 0)}</dd>
        </div>
      </dl>
      {children}
    </section>
  )
}
