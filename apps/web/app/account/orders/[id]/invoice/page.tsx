import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import {
  OrderAddress,
  OrderTotals,
} from "@/features/account/components/order-summary"
import { PrintOrder } from "@/features/account/components/print-order"
import { getAccountOrder } from "@/features/account/order-data"
import {
  formatOrderAmount,
  formatOrderDate,
  formatOrderNumber,
  getOrderStatusLabel,
  getPaymentStatusLabel,
} from "@/features/account/order-format"
import styles from "./invoice.module.css"

export const metadata: Metadata = {
  title: "Comprobante del pedido | Marketplace V2",
}
type Props = { params: Promise<{ id: string }> }

async function Invoice({ params }: Props) {
  const { id } = await params
  const order = await getAccountOrder(id)
  if (!order) notFound()
  return (
    <>
      <div
        className={`mb-6 flex flex-wrap items-center justify-between gap-4 ${styles.actions}`}
      >
        <Link
          href={`/account/orders/${id}`}
          className="text-sm underline underline-offset-4"
        >
          Volver al pedido
        </Link>
        <PrintOrder />
      </div>
      <article
        className={`${styles.invoice} space-y-8 border border-border bg-card p-5 sm:p-8`}
      >
        <header className="flex flex-wrap justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-2xl font-semibold">Comprobante del pedido</h1>
            <p className="mt-2 text-sm">Orden #{formatOrderNumber(order)}</p>
          </div>
          <div className="text-sm">
            <p>{formatOrderDate(order.created_at)}</p>
            <p className="mt-2">
              {getOrderStatusLabel(order.status)} ·{" "}
              Pago de la compra: {getPaymentStatusLabel(order.payment_status)}
            </p>
          </div>
        </header>
        <div className="grid gap-6 sm:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-semibold">Cliente</h2>
            <OrderAddress
              address={order.billing_address ?? order.shipping_address}
            />
            {order.email ? (
              <p className="mt-2 break-all text-sm text-muted-foreground">
                {order.email}
              </p>
            ) : null}
          </section>
          {order.seller?.name ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold">Vendido por</h2>
              <p className="text-sm">{order.seller.name}</p>
            </section>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-border">
                <th className="py-3 pr-4 font-medium">Producto</th>
                <th className="p-3 text-right font-medium">Cantidad</th>
                <th className="p-3 text-right font-medium">Precio unitario</th>
                <th className="py-3 pl-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items?.map((item) => (
                <tr key={item.id} className="border-b border-border">
                  <td className="py-4 pr-4">{item.title}</td>
                  <td className="p-3 text-right">{item.quantity}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    {formatOrderAmount(item.unit_price, order.currency_code)}
                  </td>
                  <td className="whitespace-nowrap py-3 pl-3 text-right">
                    {formatOrderAmount(item.total, order.currency_code)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ml-auto max-w-sm">
          <OrderTotals order={order} />
        </div>
        <p className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          Resumen de la compra registrada. Este comprobante no sustituye una
          factura fiscal emitida por el vendedor.
        </p>
      </article>
    </>
  )
}

export default function InvoicePage(props: Props) {
  return (
    <Suspense
      fallback={
        <Skeleton className="h-96 w-full" aria-label="Cargando comprobante" />
      }
    >
      <Invoice {...props} />
    </Suspense>
  )
}
