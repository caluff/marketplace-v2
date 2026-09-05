import Link from "next/link";
import type { HttpTypes } from "@mercurjs/types";
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

export function RecentOrders({
  orders,
}: {
  orders: HttpTypes.VendorOrderListResponse["orders"];
}) {
  if (!orders.length)
    return (
      <DataEmpty
        title="Todavía no hay pedidos"
        description="Los pedidos asignados a esta tienda aparecerán aquí."
      />
    );
  return (
    <Table>
      <caption className="sr-only">Pedidos de esta tienda</caption>
      <TableHeader>
        <TableRow>
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
                className="font-mono text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                #{order.display_id ?? order.id}
              </Link>
            </TableCell>
            <TableCell>{order.email || "Sin correo"}</TableCell>
            <TableCell>
              <StatusBadge status={order.status} />
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
