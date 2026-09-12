import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { FetchError } from "@medusajs/js-sdk";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { requireAdminSdk } from "@/lib/auth-sdk";
import {
  listOrders,
  orderProductImages,
  retrieveOrder,
  type OperatorOrder,
} from "./data";
import {
  canComplete,
  logisticsLabel,
  orderDate,
  canDeliver,
  isOrderId,
  money,
  ORDER_STATUSES,
  orderListHref,
  parseOrderFilters,
  safeUrl,
  statusLabel,
} from "./helpers";
import { OrderActionForm } from "./action-form";

export function OrderRegionSkeleton() {
  return (
    <div aria-label="Cargando pedidos" className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
function OrderReadError({ href }: { href: string }) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-border p-6">
      <p className="text-sm text-muted-foreground">
        No pudimos cargar los pedidos.
      </p>
      <Button asChild size="sm" variant="outline">
        <a href={href}>Reintentar</a>
      </Button>
    </div>
  );
}
export function OrderFilters({
  filters,
}: {
  filters: ReturnType<typeof parseOrderFilters>;
}) {
  return (
    <form
      action="/dashboard/orders"
      className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_240px_auto]"
    >
      <Field>
        <FieldLabel htmlFor="order-search">Búsqueda general</FieldLabel>
        <Input
          id="order-search"
          name="q"
          defaultValue={filters.q}
          maxLength={100}
          placeholder="Número, email o dirección"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="order-status">Estado del pedido</FieldLabel>
        <NativeSelect
          id="order-status"
          name="status"
          defaultValue={filters.status}
        >
          <NativeSelectOption value="all">Todos los estados</NativeSelectOption>
          {Object.entries(ORDER_STATUSES).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Button variant="outline" type="submit">
        Filtrar
      </Button>
    </form>
  );
}
function ItemImage(props: {
  src?: string | null;
  title: string;
  productId?: string | null;
  images: Promise<Map<string, string>>;
}) {
  return (
    <Suspense fallback={<Skeleton className="size-12 shrink-0 rounded-md" />}>
      <ResolvedItemImage {...props} />
    </Suspense>
  );
}
async function ResolvedItemImage({
  src,
  title,
  productId,
  images,
}: {
  src?: string | null;
  title: string;
  productId?: string | null;
  images: Promise<Map<string, string>>;
}) {
  const url =
    safeUrl(src) ?? (productId ? (await images).get(productId) : null);
  return url ? (
    <Image
      src={url}
      alt={title}
      width={48}
      height={48}
      unoptimized
      className="size-12 shrink-0 rounded-md border border-border object-cover"
    />
  ) : (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-center text-[10px] text-muted-foreground">
      Sin imagen
    </span>
  );
}
function Seller({ order }: { order: OperatorOrder }) {
  return order.seller ? (
    <Link
      className="hover:underline"
      href={`/dashboard/stores/${encodeURIComponent(order.seller.id)}`}
    >
      {order.seller.name}
    </Link>
  ) : (
    <>Sin tienda vinculada</>
  );
}
function Buyer({ order }: { order: OperatorOrder }) {
  const name = [order.customer?.first_name, order.customer?.last_name]
    .filter(Boolean)
    .join(" ");
  return (
    <div>
      {name && <p className="font-medium">{name}</p>}
      <p className="text-sm text-muted-foreground">
        {order.email || "Sin email"}
      </p>
    </div>
  );
}
export async function OrderResults({
  filters,
}: {
  filters: ReturnType<typeof parseOrderFilters>;
}) {
  const sdk = await requireAdminSdk();
  let result;
  try {
    result = await listOrders(sdk, filters);
  } catch {
    return <OrderReadError href={orderListHref(filters, filters.offset)} />;
  }
  const images = orderProductImages(sdk, result.orders);
  return (
    <Card>
      <CardContent className="pt-6">
        {result.orders.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Pedido / artículos",
                  "Tienda",
                  "Comprador",
                  "Estado",
                  "Pago de la compra",
                  "Preparación / envío",
                  "Total",
                ].map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="font-semibold hover:underline"
                    >
                      #{order.display_id}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {orderDate(order.created_at)}
                    </p>
                    <div className="mt-2 space-y-2">
                      {order.items?.slice(0, 2).map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <ItemImage
                            src={
                              item.thumbnail || item.variant?.product?.thumbnail
                            }
                            title={item.title}
                            productId={item.product_id}
                            images={images}
                          />
                          <span className="max-w-48 truncate text-xs">
                            {item.quantity} × {item.title}
                          </span>
                        </div>
                      ))}
                      {order.items?.length > 2 && (
                        <p className="text-xs text-muted-foreground">
                          +{order.items.length - 2} artículos
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Seller order={order} />
                  </TableCell>
                  <TableCell>
                    <Buyer order={order} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">{statusLabel(order.status)}</Badge>
                  </TableCell>
                  <TableCell>{statusLabel(order.payment_status)}</TableCell>
                  <TableCell>{logisticsLabel(order)}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {money(order.total, order.currency_code)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            No hay pedidos con estos filtros.
          </p>
        )}
        <nav
          aria-label="Páginas de pedidos"
          className="mt-5 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-xs text-muted-foreground">
            {result.orders.length
              ? `${result.offset + 1}–${result.offset + result.orders.length} de ${result.count}`
              : `0 de ${result.count}`}
          </p>
          <div className="flex gap-2">
            {result.offset > 0 && (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={orderListHref(filters, result.offset - result.limit)}
                >
                  Anterior
                </Link>
              </Button>
            )}
            {result.offset + result.limit < result.count && (
              <Button asChild size="sm" variant="outline">
                <Link
                  href={orderListHref(filters, result.offset + result.limit)}
                >
                  Siguiente
                </Link>
              </Button>
            )}
          </div>
        </nav>
      </CardContent>
    </Card>
  );
}
function OrderDetails({
  order,
  images,
}: {
  order: OperatorOrder;
  images: Promise<Map<string, string>>;
}) {
  const address = order.shipping_address;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>Pedido #{order.display_id}</CardTitle>
            <Badge variant="neutral">{statusLabel(order.status)}</Badge>
          </div>
          <p className="break-all text-xs text-muted-foreground">{order.id}</p>
          <p className="text-xs text-muted-foreground">
            Creado {orderDate(order.created_at)} · hora de Uruguay
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Tienda</p>
            <Seller order={order} />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Comprador</p>
            <Buyer order={order} />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Pago de la compra</p>
            <p>{statusLabel(order.payment_status)}</p>
          </div>
        </CardContent>
      </Card>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Artículos</CardTitle>
            </CardHeader>
            <CardContent>
              {order.items?.length ? (
                <ul className="divide-y divide-border">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex gap-3 py-4 first:pt-0">
                      <ItemImage
                        src={item.thumbnail || item.variant?.product?.thumbnail}
                        title={item.title}
                        productId={item.product_id}
                        images={images}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.quantity} ×{" "}
                          {money(item.unit_price, order.currency_code)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Preparados:{" "}
                          {item.detail?.fulfilled_quantity ?? "Sin informar"} ·
                          Enviados:{" "}
                          {item.detail?.shipped_quantity ?? "Sin informar"} ·
                          Entregados:{" "}
                          {item.detail?.delivered_quantity ?? "Sin informar"}
                        </p>
                      </div>
                      <p className="text-sm font-medium">
                        {money(item.total, order.currency_code)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No se recibieron artículos para este pedido.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Preparación y seguimiento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">{logisticsLabel(order)}</p>
              {order.fulfillments?.length ? (
                order.fulfillments.map((fulfillment) => (
                  <div
                    key={fulfillment.id}
                    className="space-y-3 rounded-lg border border-border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="break-all text-xs text-muted-foreground">
                        {fulfillment.id}
                      </p>
                      <Badge variant="neutral">
                        {fulfillment.canceled_at
                          ? "Cancelado"
                          : fulfillment.delivered_at
                            ? "Entregado"
                            : fulfillment.shipped_at
                              ? "Enviado"
                              : "Preparado"}
                      </Badge>
                    </div>
                    {fulfillment.labels?.length ? (
                      <ul className="space-y-2 text-sm">
                        {fulfillment.labels.map((label) => {
                          const url = safeUrl(label.tracking_url);
                          return (
                            <li key={label.id}>
                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                >
                                  {label.tracking_number || "Ver seguimiento"}
                                </a>
                              ) : (
                                label.tracking_number ||
                                "Sin número de seguimiento"
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Sin seguimiento registrado.
                      </p>
                    )}
                    {canDeliver(order, fulfillment.id) && (
                      <OrderActionForm
                        id={order.id}
                        operation="deliver"
                        fulfillmentId={fulfillment.id}
                      />
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay preparaciones registradas.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Importes</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                {[
                  ["Artículos (importe final)", order.item_total],
                  ["Envío", order.shipping_total],
                  ["Descuentos aplicados", order.discount_total],
                  ["Impuestos incluidos", order.tax_total],
                  ["Total", order.total],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex justify-between gap-3"
                  >
                    <dt>{label}</dt>
                    <dd className="font-medium">
                      {money(
                        typeof value === "number" ? value : undefined,
                        order.currency_code,
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Dirección de entrega</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {address ? (
                <>
                  <p>
                    {[address.first_name, address.last_name]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                  <p>
                    {[address.address_1, address.address_2]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p>
                    {[
                      address.city,
                      address.province,
                      address.postal_code,
                      address.country_code?.toUpperCase(),
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {address.phone && <p>{address.phone}</p>}
                </>
              ) : (
                <p className="text-muted-foreground">
                  Sin dirección registrada.
                </p>
              )}
              {order.shipping_methods?.map((method) => (
                <p key={method.id} className="text-muted-foreground">
                  {method.name}
                </p>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Operaciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canComplete(order) ? (
                <OrderActionForm id={order.id} operation="complete" />
              ) : order.status === "pending" ? (
                <p className="text-sm text-muted-foreground">
                  Completar requiere un pedido pendiente con todos sus artículos
                  entregados.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Este pedido está {statusLabel(order.status).toLowerCase()}.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
export async function OrderDetailRegion({ id }: { id: string }) {
  if (!isOrderId(id)) notFound();
  const sdk = await requireAdminSdk();
  let order;
  try {
    order = await retrieveOrder(sdk, id);
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) notFound();
    return <OrderReadError href={`/dashboard/orders/${id}`} />;
  }
  return (
    <OrderDetails order={order} images={orderProductImages(sdk, [order])} />
  );
}
