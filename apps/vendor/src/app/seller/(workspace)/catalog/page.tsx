import type { Metadata } from "next";
import { Suspense } from "react";
import type { HttpTypes } from "@mercurjs/types";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DataEmpty,
  DataError,
  PageHeading,
  Pagination,
  SearchForm,
  StatusBadge,
} from "@/features/workspace/components";
import { workspace, resultOf } from "@/features/workspace/data";
import { formatDate, listInput } from "@/features/workspace/presentation";
import { CatalogThumbnail } from "@/features/catalog/catalog-thumbnail";
import {
  catalogCommerce,
  CatalogCommerceCells,
  CatalogSaleActions,
} from "@/features/catalog/catalog-commerce";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ProductRowActions } from "@/features/catalog/product-row-actions";

export const metadata: Metadata = { title: "Catálogo" };
async function CatalogResults({
  input,
}: {
  input: ReturnType<typeof listInput>;
}) {
  const { client, membership } = await workspace();
  const result = await resultOf(
    client.get<HttpTypes.VendorProductListResponse>("/vendor/products", {
      q: input.q || undefined,
      offset: input.offset,
      limit: input.limit,
      order: "-created_at",
      fields:
        "id,title,handle,thumbnail,images.url,status,created_at,variants.id,changes.status,changes.created_by",
    }),
  );
  const commerce = result.data?.products.length
    ? resultOf(
        catalogCommerce(
          client,
          result.data.products.flatMap(
            (product) => product.variants?.map((variant) => variant.id) ?? [],
          ),
        ),
      )
    : null;
  return (
    <>
      {result.data ? (
        <Card>
          {result.data.products.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Precio (USD)</TableHead>
                  <TableHead>Existencias de tu tienda</TableHead>
                  <TableHead>Presentaciones</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link
                        href={`/seller/catalog/${product.id}`}
                        className="flex items-center gap-3 font-semibold text-primary hover:underline"
                      >
                        <CatalogThumbnail
                          key={product.thumbnail || product.images?.[0]?.url}
                          src={product.thumbnail || product.images?.[0]?.url}
                        />
                        {product.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={product.status} />
                      {product.changes?.some(
                        (change) =>
                          change.status === "pending" &&
                          change.created_by === membership.seller.id,
                      ) ? (
                        <Badge variant="warning" className="mt-1 block">
                          Cambio pendiente
                        </Badge>
                      ) : null}
                    </TableCell>
                    {commerce ? (
                      <Suspense
                        fallback={
                          <>
                            <TableCell>
                              <Skeleton className="h-5 w-24" />
                            </TableCell>
                            <TableCell>
                              <Skeleton className="h-5 w-24" />
                            </TableCell>
                          </>
                        }
                      >
                        <CatalogCommerceCells
                          data={commerce}
                          variantIds={
                            product.variants?.map((variant) => variant.id) ?? []
                          }
                        />
                      </Suspense>
                    ) : null}
                    <TableCell>{product.variants?.length ?? 0}</TableCell>
                    <TableCell>{formatDate(product.created_at)}</TableCell>
                    <TableCell>
                      <Suspense
                        fallback={
                          <ProductRowActions
                            productId={product.id}
                            title={product.title}
                          />
                        }
                      >
                        {commerce ? (
                          <CatalogSaleActions
                            data={commerce}
                            productId={product.id}
                            title={product.title}
                            variantIds={
                              product.variants?.map((variant) => variant.id) ??
                              []
                            }
                          />
                        ) : null}
                      </Suspense>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <DataEmpty
              title={input.q ? "Sin coincidencias" : "El catálogo está vacío"}
              description="Crea un producto o prueba otra búsqueda."
            />
          )}
          <Pagination
            path="/seller/catalog"
            page={input.page}
            count={result.data.count}
            q={input.q}
          />
        </Card>
      ) : (
        <DataError message={result.error} />
      )}
    </>
  );
}
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await workspace();
  const input = listInput(await searchParams);
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Catálogo"
        title="Productos disponibles"
        description="Tus productos y el catálogo compartido publicado al que esta tienda tiene acceso. Los cambios se envían a revisión."
      >
        <Button asChild className="h-11">
          <Link href="/seller/catalog/new">
            <Plus aria-hidden="true" />
            Crear producto
          </Link>
        </Button>
      </PageHeading>
      <SearchForm q={input.q} label="Buscar productos" />
      <Suspense
        fallback={
          <div
            role="status"
            className="h-80 animate-pulse rounded-lg bg-muted p-5 text-sm text-muted-foreground"
          >
            Cargando productos…
          </div>
        }
      >
        <CatalogResults input={input} />
      </Suspense>
    </div>
  );
}
