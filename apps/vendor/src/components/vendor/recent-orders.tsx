import Link from "next/link";
import type { HttpTypes } from "@mercurjs/types";
import type { OrderDetailDTO } from "@medusajs/types";
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
import { CatalogThumbnail } from "@/features/catalog/catalog-thumbnail";
import { getOrderDisplayStatus } from "@/features/orders/status";

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
  return (
    <Table>
      <caption className="sr-only">Pedidos de esta tienda</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Productos</TableHead>
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
                className="flex min-w-44 items-center gap-3 text-sm font-semibold underline-offset-4 hover:underline"
                aria-label={`Ver pedido #${order.display_id ?? order.id}`}
              >
                <span className="flex -space-x-3">
                  {order.items?.length ? (
                    order.items
                      .slice(0, 3)
                      .map((item) => (
                        <CatalogThumbnail key={item.id} src={item.thumbnail} />
                      ))
                  ) : (
                    <CatalogThumbnail />
                  )}
                </span>
                <span className="min-w-0">
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
