import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  demoOrders,
  formatDemoCurrency,
  type DemoOrderStatus,
} from "@/lib/demo-data";

const statusVariant: Record<DemoOrderStatus, "success" | "warning" | "muted"> =
  {
    Preparando: "warning",
    Listo: "success",
    "En revisión": "muted",
  };

export function RecentOrders() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between border-b border-border/70">
        <div>
          <CardTitle>Pedidos recientes</CardTitle>
          <CardDescription>
            Actividad ficticia para validar la tabla.
          </CardDescription>
        </div>
        <Badge variant="outline">Demo</Badge>
      </CardHeader>
      <Table className="min-w-[680px]">
        <caption className="sr-only">
          Pedidos ficticios de la vista de demostración
        </caption>
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
          {demoOrders.map((order) => (
            <TableRow key={order.id}>
              <TableCell>
                <p className="font-mono text-xs font-semibold">{order.id}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {order.items} {order.items === 1 ? "artículo" : "artículos"}
                </p>
              </TableCell>
              <TableCell className="font-medium">{order.customer}</TableCell>
              <TableCell>
                <Badge variant={statusVariant[order.status]}>
                  {order.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {order.placedAt}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {formatDemoCurrency(order.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
