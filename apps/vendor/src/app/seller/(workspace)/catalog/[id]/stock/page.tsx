import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { HttpTypes } from "@mercurjs/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeading, DataError } from "@/features/workspace/components";
import { workspace, resultOf } from "@/features/workspace/data";
import { catalogCommerce } from "@/features/catalog/catalog-commerce";
import {
  InventoryStock,
  StockSkeleton,
} from "@/features/inventory/inventory-stock";
import { resourceId } from "@/features/workspace/validation";

export const metadata: Metadata = { title: "Existencias del producto" };
async function ProductStock({ id }: { id: string }) {
  const { client } = await workspace();
  const result = await resultOf(
    client.get<HttpTypes.VendorProductResponse>(
      `/vendor/products/${resourceId(id)}`,
      { fields: "id,title,variants.id" },
    ),
  );
  if (!result.data) return <DataError message={result.error} />;
  const { product } = result.data;
  const data = await resultOf(
    catalogCommerce(
      client,
      product.variants?.map((variant) => variant.id) ?? [],
    ),
  );
  if (!data.data) return <DataError message={data.error} />;
  const items = data.data.inventory;
  if (!items.data) return <DataError message={items.error} />;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{product.title}</h2>
      {!items.data.length ? (
        <p className="text-sm text-muted-foreground">
          Configura el precio y las existencias iniciales desde el detalle del
          producto.
        </p>
      ) : (
        items.data.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle>{item.title || product.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <InventoryStock
                item={item}
                warehouse={Promise.resolve(data.data.warehouse)}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
export default async function StockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeading eyebrow="Catálogo" title="Existencias del producto" />
      <Link
        href={`/seller/catalog/${id}`}
        className="inline-block text-sm underline"
      >
        Volver al producto
      </Link>
      <Suspense fallback={<StockSkeleton />}>
        <ProductStock id={id} />
      </Suspense>
    </div>
  );
}
