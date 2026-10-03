import type { HttpTypes } from "@medusajs/types"
import type { ReactNode } from "react"
import { ProductThumbnail } from "@/components/ui/product-thumbnail"
import { getMoneyRoundingAdjustment } from "@/lib/money-rounding"
import { getDiscountSubtotal } from "../discount-subtotal"
import { formatMoney } from "../presentation"

export function OrderSummary({
  cart,
  children,
}: {
  cart: HttpTypes.StoreCart
  children?: ReactNode
}) {
  const money = (amount: number) => formatMoney(amount, cart.currency_code)
  const discount = getDiscountSubtotal(cart)
  const roundingAdjustment =
    cart.shipping_methods?.length && cart.shipping_address?.address_1
      ? getMoneyRoundingAdjustment({
          amounts: [
            cart.item_subtotal ?? cart.subtotal ?? 0,
            discount > 0 ? -discount : 0,
            cart.shipping_subtotal ?? 0,
            cart.tax_total ?? 0,
          ],
          total: cart.total ?? 0,
          currency: cart.currency_code,
        })
      : 0
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
      {cart.items?.length ? (
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Productos del pedido">
          {cart.items.map((item) => (
            <li key={item.id} title={`${item.quantity} × ${item.title}`}>
              <ProductThumbnail
                src={
                  item.thumbnail ||
                  item.variant?.thumbnail ||
                  item.product?.thumbnail ||
                  item.product?.images?.[0]?.url ||
                  item.variant?.product?.thumbnail ||
                  item.variant?.product?.images?.[0]?.url
                }
                alt={item.title}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="mt-6 space-y-4 border-t border-border pt-5 font-sans text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">
            Subtotal ({itemCount} {itemCount === 1 ? "producto" : "productos"})
          </dt>
          <dd className="font-medium tabular-nums">
            {money(cart.item_subtotal ?? cart.subtotal ?? 0)}
          </dd>
        </div>
        {discount > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Descuentos</dt>
            <dd className="font-medium tabular-nums">
              −{money(discount)}
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
        {roundingAdjustment !== 0 ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Ajuste por redondeo</dt>
            <dd className="font-medium tabular-nums">
              {money(roundingAdjustment)}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 border-t border-foreground pt-5 text-lg font-black">
          <dt>Total (USD)</dt>
          <dd className="tabular-nums">{money(cart.total ?? 0)}</dd>
        </div>
      </dl>
      {children}
    </section>
  )
}
