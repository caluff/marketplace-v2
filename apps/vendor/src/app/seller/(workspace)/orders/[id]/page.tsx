import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DataError,
  PageHeading,
  StatusBadge,
} from "@/features/workspace/components";
import {
  ORDER_FIELDS,
  resultOf,
  workspace,
  type VendorOrderDetailResponse,
} from "@/features/workspace/data";
import { formatDate, formatMoney } from "@/features/workspace/presentation";
import { resourceId } from "@/features/workspace/validation";

export const metadata: Metadata = { title: "Detalle de pedido" };
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { client } = await workspace();
  const id = resourceId((await params).id);
  const result = await resultOf(
    client.get<VendorOrderDetailResponse>(`/vendor/orders/${id}`, {
      fields: ORDER_FIELDS,
    }),
  );
  if (!result.data) return <DataError message={result.error} />;
  const { order } = result.data;
  const address = order.shipping_address;
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Pedidos"
        title={`Pedido #${order.display_id ?? order.id}`}
        description={`${formatDate(order.created_at)} · ${order.email || "Sin correo"}`}
      >
        <StatusBadge status={order.status} />
      </PageHeading>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Artículos</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artículo</TableHead>
                <TableHead>Cantidad</TableHead>
                <TableHead>Precio unitario</TableHead>
                <TableHead>Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.title}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>
                    {formatMoney(item.unit_price, order.currency_code)}
                  </TableCell>
                  <TableCell>
                    {formatMoney(item.total, order.currency_code)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CardContent className="pt-6">
            <p className="flex justify-between font-semibold">
              <span>Total del pedido</span>
              <span className="font-mono">
                {formatMoney(order.total, order.currency_code)}
              </span>
            </p>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Estado de preparación</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {order.fulfillments?.length ? (
                  order.fulfillments.map((fulfillment) => (
                    <p key={fulfillment.id}>
                      {fulfillment.canceled_at
                        ? "Preparación cancelada"
                        : fulfillment.delivered_at
                          ? "Entregado"
                          : fulfillment.shipped_at
                            ? "Enviado"
                            : fulfillment.packed_at
                              ? "Empacado"
                              : "En preparación"}
                    </p>
                  ))
                ) : (
                  <p>Sin preparaciones registradas</p>
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Consulta de solo lectura. La preparación y los envíos requieren
                la configuración logística de la tienda.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Dirección de entrega</CardTitle>
            </CardHeader>
            <CardContent>
              <address className="text-sm not-italic leading-6">
                {address ? (
                  <>
                    {[address.first_name, address.last_name]
                      .filter(Boolean)
                      .join(" ")}
                    <br />
                    {address.address_1}
                    {address.address_2 ? (
                      <>
                        <br />
                        {address.address_2}
                      </>
                    ) : null}
                    <br />
                    {[address.city, address.province, address.postal_code]
                      .filter(Boolean)
                      .join(", ")}
                    <br />
                    {address.country_code?.toUpperCase()}
                  </>
                ) : (
                  "Sin dirección de entrega."
                )}
              </address>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
