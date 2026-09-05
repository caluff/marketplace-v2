import { ArrowUpRight, Package } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { AccountHeading } from "@/features/account/components/account-heading"
import { AccountEmptyState } from "@/features/account/components/empty-state"
import { AccountPagination } from "@/features/account/components/pagination"
import {
  ACCOUNT_PAGE_SIZE,
  getAccount,
  getPageNumber,
} from "@/features/account/data"
import {
  formatOrderAmount,
  formatOrderDate,
  formatOrderNumber,
  getOrderStatusLabel,
  getShippingStatusLabel,
} from "@/features/account/order-format"

export const metadata: Metadata = { title: "Mis órdenes | Marketplace V2" }

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const [{ sdk }, params] = await Promise.all([getAccount(), searchParams])
  const page = getPageNumber(params.page)
  const { orders, count } = await sdk.store.order.list({
    limit: ACCOUNT_PAGE_SIZE,
    offset: (page - 1) * ACCOUNT_PAGE_SIZE,
    order: "-created_at",
    fields: "+items.id,+items.title,+items.quantity,+items.variant_title",
  })
  const lastPage = Math.max(1, Math.ceil(count / ACCOUNT_PAGE_SIZE))
  if (page > lastPage) redirect(`/account/orders?page=${lastPage}`)

  return (
    <>
      <AccountHeading
        title="Mis órdenes"
        description="Los detalles de tus compras y el estado de cada entrega, en un solo lugar."
      />
      {orders.length === 0 ? (
        <AccountEmptyState
          icon={<Package aria-hidden="true" />}
          title="Tu próxima compra empieza aquí"
        >
          Todavía no tienes órdenes. Cuando realices una compra, podrás
          consultar aquí todos sus detalles.
        </AccountEmptyState>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => {
            const items = order.items ?? []
            const number = formatOrderNumber(order)
            return (
              <Card key={order.id} className="gap-4 bg-transparent">
                <CardHeader className="gap-4 sm:flex sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <CardTitle className="text-lg font-medium">
                      <h2>Orden #{number}</h2>
                    </CardTitle>
                    <CardDescription>
                      {formatOrderDate(order.created_at)}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {getOrderStatusLabel(order.status)}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-sm">
                    {items.slice(0, 2).map((item) => (
                      <li key={item.id} className="flex gap-3">
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {item.quantity} ×
                        </span>
                        <span className="min-w-0 truncate">{item.title}</span>
                      </li>
                    ))}
                  </ul>
                  {items.length > 2 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Y {items.length - 2}{" "}
                      {items.length === 3 ? "producto más" : "productos más"}
                    </p>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">
                    Entrega: {getShippingStatusLabel(order.fulfillment_status)}
                  </p>
                </CardContent>
                <CardFooter className="flex-wrap justify-between gap-4 border-t border-border pt-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="mt-1 text-lg font-medium tabular-nums">
                      {formatOrderAmount(order.total, order.currency_code)}
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link
                      href={`/account/orders/${encodeURIComponent(order.id)}`}
                      aria-label={`Ver detalles de la orden ${number}`}
                    >
                      Ver detalles
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
      <AccountPagination
        page={page}
        count={count}
        pageSize={ACCOUNT_PAGE_SIZE}
        href="/account/orders"
      />
    </>
  )
}
