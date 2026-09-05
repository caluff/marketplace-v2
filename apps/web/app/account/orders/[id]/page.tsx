import type { HttpTypes } from "@medusajs/types"
import { ArrowLeft, MapPin, Package } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AccountHeading } from "@/features/account/components/account-heading"
import { getAccount } from "@/features/account/data"
import {
  formatOrderAmount,
  formatOrderDate,
  formatOrderNumber,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  getShippingStatusLabel,
} from "@/features/account/order-format"

export const metadata: Metadata = {
  title: "Detalle de la orden | Marketplace V2",
}

function OrderAddress({
  address,
}: {
  address: HttpTypes.StoreOrderAddress | null | undefined
}) {
  if (!address)
    return (
      <p className="text-sm text-muted-foreground">
        No hay una dirección registrada para esta orden.
      </p>
    )

  return (
    <address className="space-y-1 text-sm leading-6 not-italic">
      <p className="font-medium">
        {[address.first_name, address.last_name].filter(Boolean).join(" ")}
      </p>
      {address.company && <p>{address.company}</p>}
      <p>{address.address_1}</p>
      {address.address_2 && <p>{address.address_2}</p>}
      <p>
        {[address.city, address.province?.toUpperCase(), address.postal_code]
          .filter(Boolean)
          .join(", ")}
      </p>
      <p>
        {address.country_code?.toLowerCase() === "us"
          ? "Estados Unidos"
          : address.country_code?.toUpperCase()}
      </p>
      {address.phone && (
        <p className="pt-2 text-muted-foreground">{address.phone}</p>
      )}
    </address>
  )
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ sdk }, { id }] = await Promise.all([getAccount(), params])
  // The list endpoint applies customer ownership; single-order retrieval is public.
  const { orders } = await sdk.store.order.list({
    id,
    limit: 1,
    fields:
      "+items.*,+shipping_address.*,+billing_address.*,+shipping_methods.*,+original_item_subtotal,+original_shipping_subtotal,+tax_total,+discount_total,+discount_tax_total,+credit_line_total",
  })
  const order = orders[0]
  if (!order) notFound()

  const items = order.items ?? []
  const formatAmount = (amount: number) =>
    formatOrderAmount(amount, order.currency_code)
  const discountSubtotal = order.discount_total - order.discount_tax_total

  return (
    <>
      <AccountHeading
        title={`Orden #${formatOrderNumber(order)}`}
        description={`Realizada el ${formatOrderDate(order.created_at)}.`}
      />
      <div className="mb-8 flex flex-wrap gap-3">
        <Badge variant="outline">{getOrderStatusLabel(order.status)}</Badge>
        <Badge variant="outline">
          {getShippingStatusLabel(order.fulfillment_status)}
        </Badge>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="bg-transparent">
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              <h2>Productos de tu orden</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Los productos de esta orden no están disponibles.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex gap-4 py-5 first:pt-0 last:pb-0"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center bg-muted text-muted-foreground">
                      <Package className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium leading-6">
                        {item.title}
                      </h3>
                      {item.variant_title &&
                        item.variant_title !== "Default Variant" && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.variant_title}
                          </p>
                        )}
                      <p className="mt-2 text-xs text-muted-foreground">
                        Cantidad: {item.quantity} ·{" "}
                        {formatAmount(item.unit_price)} por unidad
                      </p>
                      <p className="mt-2 text-sm font-medium tabular-nums">
                        {formatAmount(item.total)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="self-start bg-transparent">
          <CardHeader>
            <CardTitle className="text-lg font-medium">
              <h2>Resumen</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Productos</dt>
                <dd className="tabular-nums">
                  {formatAmount(order.original_item_subtotal)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Envío</dt>
                <dd className="tabular-nums">
                  {formatAmount(order.original_shipping_subtotal)}
                </dd>
              </div>
              {discountSubtotal > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Descuentos</dt>
                  <dd className="tabular-nums">
                    −{formatAmount(discountSubtotal)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Impuestos</dt>
                <dd className="tabular-nums">
                  {formatAmount(order.tax_total)}
                </dd>
              </div>
              {order.credit_line_total > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Créditos aplicados</dt>
                  <dd className="tabular-nums">
                    −{formatAmount(order.credit_line_total)}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-4 border-t border-border pt-5">
            <div className="flex justify-between gap-3 text-lg font-medium">
              <span>Total</span>
              <span className="tabular-nums">{formatAmount(order.total)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Estado del pago: {getPaymentStatusLabel(order.payment_status)}
            </p>
          </CardFooter>
        </Card>
        <Card className="bg-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-medium">
              <MapPin className="size-4" aria-hidden="true" />
              <h2>Dirección de entrega</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <OrderAddress address={order.shipping_address} />
            {!!order.shipping_methods?.length && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  Método de envío
                </p>
                {order.shipping_methods.map((method) => (
                  <p key={method.id} className="text-sm leading-6">
                    {method.name}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {order.billing_address && (
          <Card className="self-start bg-transparent">
            <CardHeader>
              <CardTitle className="text-lg font-medium">
                <h2>Dirección de facturación</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-6">
              <OrderAddress address={order.billing_address} />
            </CardContent>
          </Card>
        )}
      </div>
      <Button asChild variant="outline" className="mt-8">
        <Link href="/account/orders">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a mis órdenes
        </Link>
      </Button>
    </>
  )
}
