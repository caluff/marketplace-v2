import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "Catálogo" };
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { client } = await workspace();
  const input = listInput(await searchParams);
  const result = await resultOf(
    client.get<HttpTypes.VendorProductListResponse>("/vendor/products", {
      q: input.q || undefined,
      offset: input.offset,
      limit: input.limit,
      order: "-created_at",
      fields: "id,title,handle,status,created_at,variants.id",
    }),
  );
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
      {result.data ? (
        <Card>
          {result.data.products.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Variantes</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Link
                        href={`/seller/catalog/${product.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {product.title}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {product.handle}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={product.status} />
                    </TableCell>
                    <TableCell>{product.variants?.length ?? 0}</TableCell>
                    <TableCell>{formatDate(product.created_at)}</TableCell>
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
    </div>
  );
}
