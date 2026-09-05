import type { HttpTypes } from "@mercurjs/types";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
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
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          Catálogo · Mercur
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Revisión de productos
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Publicación de nuevos productos y revisión de cambios. Las ofertas,
          precios y existencias pertenecen a cada vendedor.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Catálogo del marketplace</CardTitle>
          <CardDescription>
            {result.count} productos con los filtros actuales. Los cambios
            pendientes también pueden estar en productos ya publicados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action="/dashboard/product-review"
            className="mb-6 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_220px_auto]"
          >
            <Field>
              <FieldLabel htmlFor="product-search">Buscar producto</FieldLabel>
              <Input
                id="product-search"
                name="q"
                maxLength={100}
                defaultValue={filters.q}
                placeholder="Título o identificador"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="product-status">Estado</FieldLabel>
              <NativeSelect
                id="product-status"
                name="status"
                defaultValue={filters.status}
              >
                <NativeSelectOption value="all">
                  Todos los estados
                </NativeSelectOption>
                {Object.entries(PRODUCT_STATUS_LABELS).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </form>
          {result.products.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
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
                      <p className="font-semibold">{product.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {product.handle}
                      </p>
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
              No hay productos con estos filtros. No se muestran datos de
              demostración.
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
