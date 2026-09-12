import type { HttpTypes } from "@mercurjs/types";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
  parseProductReviewFilters,
  PRODUCT_STATUS_LABELS,
  productReviewHref,
} from "@/features/product-review/helpers";

export function ProductReviewList({
  filters,
  result,
}: {
  filters: ReturnType<typeof parseProductReviewFilters>;
  result: HttpTypes.AdminProductListResponse;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Catálogo del marketplace</CardTitle>
          <CardDescription>
            {result.count} productos con los filtros actuales. Los cambios
            pendientes también pueden estar en productos ya publicados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {result.products.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Tiendas vinculadas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Cambios</TableHead>
                  <TableHead>
                    <span className="sr-only">Abrir</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/product-review/${encodeURIComponent(product.id)}`}
                        className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        <span>
                          <span className="block font-semibold">
                            {product.title}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {product.handle}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      {product.sellers
                        ?.map((seller) => seller.name)
                        .join(", ") || "No informadas en el catálogo"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          product.status === "published" ? "success" : "neutral"
                        }
                      >
                        {PRODUCT_STATUS_LABELS[product.status] ??
                          product.status}
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
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/dashboard/product-review/${encodeURIComponent(product.id)}`}
                          aria-label={`Revisar ${product.title}`}
                        >
                          Revisar
                        </Link>
                      </Button>
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
                    href={productReviewHref(
                      filters,
                      result.offset - result.limit,
                    )}
                  >
                    Anterior
                  </Link>
                </Button>
              )}
              {result.offset + result.limit < result.count && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={productReviewHref(
                      filters,
                      result.offset + result.limit,
                    )}
                  >
                    Siguiente
                  </Link>
                </Button>
              )}
            </div>
          </nav>
        </CardContent>
      </Card>
    </div>
  );
}
