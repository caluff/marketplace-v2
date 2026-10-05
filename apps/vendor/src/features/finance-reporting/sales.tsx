import type { FinanceReportingSale } from "@marketplace-v2/api/finance-contracts";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orderImageItems } from "@/features/orders/image-data";
import { LoadedOrderImages } from "@/features/orders/order-images";
import { FinanceSaleRow } from "./sale-row";

export function FinanceSales({
  sales,
  emptyMessage,
}: {
  sales: FinanceReportingSale[];
  emptyMessage: string;
}) {
  const images = sales.length
    ? orderImageItems(sales.map((sale) => sale.order_id))
    : null;
  return (
    <Table className="block sm:table">
      <caption className="sr-only">
        Cobros y ganancias del período seleccionado.
      </caption>
      <TableHeader className="hidden sm:table-header-group">
        <TableRow>
          <TableHead>Pedido</TableHead>
          <TableHead className="text-right">Cobrado al cliente</TableHead>
          <TableHead className="text-right">Para ti</TableHead>
          <TableHead>
            <span className="sr-only">Detalle</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="block sm:table-row-group">
        {sales.length ? (
          sales.map((sale) => (
            <FinanceSaleRow key={sale.order_id} sale={sale}>
              {images ? (
                <Suspense
                  fallback={
                    <Skeleton
                      className="size-12 rounded-md"
                      aria-label="Cargando imágenes del pedido"
                    />
                  }
                >
                  <LoadedOrderImages orderId={sale.order_id} result={images} />
                </Suspense>
              ) : null}
            </FinanceSaleRow>
          ))
        ) : (
          <TableRow className="block sm:table-row">
            <TableCell
              colSpan={4}
              className="block py-8 text-center text-muted-foreground sm:table-cell"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
