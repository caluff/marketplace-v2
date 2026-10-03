import Link from "next/link";
import type { HttpTypes } from "@mercurjs/types";
import type { OrderDetailDTO } from "@medusajs/types";
import { formatOrderNumber } from "@marketplace-v2/order-reference";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataEmpty, StatusBadge } from "@/features/workspace/components";
import { formatDate, formatMoney } from "@/features/workspace/presentation";
import { getOrderDisplayStatus } from "@/features/orders/status";
import { OrderImages } from "@/features/orders/order-images";
import { productThumbnailsForOrderItems } from "@/features/orders/image-data";

export function RecentOrders({
  orders,
  filtered = false,
}: {
  orders: (HttpTypes.VendorOrderListResponse["orders"][number] &
    Partial<Pick<OrderDetailDTO, "fulfillments">>)[];
  filtered?: boolean;
}) {
  if (!orders.length)
    return (
      <DataEmpty
        title={
          filtered
            ? "No hay pedidos con estos filtros"
            : "Todavía no hay pedidos"
        }
        description={
          filtered
            ? "Prueba con otro estado o término de búsqueda."
            : "Los pedidos asignados a esta tienda aparecerán aquí."
        }
      />
    );
  const products = productThumbnailsForOrderItems(
    orders.flatMap((order) => order.items ?? []),
  );
  return (
    <Table>
      <caption className="sr-only">Pedidos de esta tienda</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Imágenes</TableHead>
          <TableHead>Pedido</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell>
              <Link
                href={`/seller/orders/${order.id}`}
                className="block w-fit rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                aria-label={`Ver productos del pedido ${formatOrderNumber(order)}`}
              >
                <OrderImages items={order.items} products={products} />
              </Link>
            </TableCell>
            <TableCell>
              <Link
                href={`/seller/orders/${order.id}`}
                className="block min-w-44 text-sm font-semibold underline-offset-4 hover:underline"
                aria-label={`Ver pedido ${formatOrderNumber(order)}`}
              >
                <span className="min-w-0">
                  <span className="block">{formatOrderNumber(order)}</span>
                  <span className="block max-w-56 truncate">
                    {order.items?.[0]?.title ?? "Ver pedido"}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {order.items?.length ?? 0} artículos
                  </span>
                </span>
              </Link>
            </TableCell>
            <TableCell>{order.email || "Sin correo"}</TableCell>
            <TableCell>
              <StatusBadge status={getOrderDisplayStatus(order)} />
            </TableCell>
            <TableCell>{formatDate(order.created_at)}</TableCell>
            <TableCell className="text-right font-mono">
              {formatMoney(order.total, order.currency_code)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
