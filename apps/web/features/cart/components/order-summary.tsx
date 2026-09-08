import type { HttpTypes } from "@medusajs/types"
import { formatMoney } from "../presentation"

export function OrderSummary({ cart }: { cart: HttpTypes.StoreCart }) {
  const money = (amount: number) => formatMoney(amount, cart.currency_code)
  return (
    <section
      aria-label="Resumen del pedido"
      className="border border-border bg-muted/30 p-6"
    >
      <h2 className="text-2xl font-bold">Tu pedido</h2>
      <ul className="mt-6 space-y-4 font-sans text-sm">
        {cart.items?.map((item) => (
          <li key={item.id} className="flex justify-between gap-4">
            <span>
              {item.quantity} × {item.product_title ?? item.title}
              <span className="block text-muted-foreground">
                {item.variant_title}
              </span>
            </span>
            <span className="shrink-0">
              {money(item.total ?? item.unit_price * item.quantity)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-6 space-y-3 border-t border-border pt-5 font-sans text-sm">
        <div className="flex justify-between gap-3">
          <dt>Subtotal</dt>
          <dd>{money(cart.item_subtotal ?? cart.subtotal ?? 0)}</dd>
        </div>
        {cart.discount_total ? (
          <div className="flex justify-between">
            <dt>Descuentos</dt>
            <dd>−{money(cart.discount_total)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt>Envío</dt>
          <dd>
            {cart.shipping_methods?.length
              ? money(cart.shipping_subtotal ?? 0)
              : "A calcular"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Impuestos</dt>
          <dd>
            {cart.shipping_address?.address_1
              ? money(cart.tax_total ?? 0)
              : "A calcular"}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-foreground pt-4 text-lg font-black">
          <dt>Total (USD)</dt>
          <dd>{money(cart.total ?? 0)}</dd>
        </div>
      </dl>
    </section>
  )
}
