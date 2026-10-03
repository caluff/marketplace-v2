import type { HttpTypes } from "@mercurjs/types";
import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseProductReviewFilters,
  PRODUCT_STATUS_LABELS,
  productReviewHref,
} from "@/features/product-review/helpers";
import { listProductReviewCommerce } from "../data";
import {
  ProductReviewCommerceCells,
  ProductReviewCommerceSkeleton,
} from "./commerce-cells";

export function ProductReviewList({
  filters,
  result,
}: {
  filters: ReturnType<typeof parseProductReviewFilters>;
  result: HttpTypes.AdminProductListResponse;
}) {
  const commerce = listProductReviewCommerce(result.products);
  return (
    <div>
      {result.products.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Tienda</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Cambios</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.products.map((product) => (
              <TableRow
                key={product.id}
                className="relative cursor-pointer focus-within:bg-muted/45"
              >
                <TableCell>
                  <Link
                    href={`/dashboard/product-review/${encodeURIComponent(product.id)}`}
                    className="flex items-center gap-3 rounded-md outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {product.thumbnail?.startsWith("https://") ? (
                      <Image
                        src={product.thumbnail}
                        alt=""
                        width={48}
                        height={48}
                        unoptimized
                        className="size-12 shrink-0 rounded-md border object-contain"
                      />
                    ) : (
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                        Sin foto
                      </span>
                    )}
                    <span className="font-semibold">{product.title}</span>
                  </Link>
                </TableCell>
                <Suspense fallback={<ProductReviewCommerceSkeleton />}>
                  <ProductReviewCommerceCells
                    product={product}
                    commerce={commerce}
                  />
                </Suspense>
                <TableCell>
                  <Badge
                    variant={
                      product.status === "published" ? "success" : "neutral"
                    }
                  >
                    {PRODUCT_STATUS_LABELS[product.status] ?? product.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {product.changes?.some(
                    (change) => change.status === "pending",
                  ) ? (
                    <Badge variant="warning">Pendientes</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No hay productos con estos filtros.
        </p>
      )}
      <nav
        aria-label="Páginas del catálogo"
        className="mt-5 flex flex-wrap justify-between gap-3"
      >
        <p className="text-xs text-muted-foreground">
          {result.products.length
            ? `${result.offset + 1}–${result.offset + result.products.length} de ${result.count}`
            : `0 de ${result.count}`}
        </p>
        <div className="flex gap-2">
          {result.offset > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link
                href={productReviewHref(filters, result.offset - result.limit)}
              >
                Anterior
              </Link>
            </Button>
          )}
          {result.offset + result.limit < result.count && (
            <Button asChild variant="outline" size="sm">
              <Link
                href={productReviewHref(filters, result.offset + result.limit)}
              >
                Siguiente
              </Link>
            </Button>
          )}
        </div>
      </nav>
    </div>
  );
}
