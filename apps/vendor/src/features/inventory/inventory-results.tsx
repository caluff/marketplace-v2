import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DataEmpty,
  DataError,
  Pagination,
  SearchForm,
} from "../workspace/components";
import { resultOf } from "../workspace/data";
import type { scopedClient } from "../workspace/operations";
import { listInput } from "../workspace/presentation";
import { inventoryPage } from "./data";
import { InventorySkeleton, type WarehouseResult } from "./warehouse-card";
import { InventoryStock, StockSkeleton } from "./inventory-stock";

export async function InventoryResults({
  client,
  searchParams,
  warehouse,
}: {
  client: ReturnType<typeof scopedClient>;
  searchParams: Promise<{ q?: string; page?: string }>;
  warehouse: WarehouseResult;
}) {
  const input = listInput(await searchParams);
  return (
    <div className="space-y-6">
      <SearchForm q={input.q} label="Buscar artículo o SKU" />
      <Suspense
        key={`${input.page}:${input.q}`}
        fallback={<InventorySkeleton />}
      >
        <InventoryItems client={client} input={input} warehouse={warehouse} />
      </Suspense>
    </div>
  );
}

async function InventoryItems({
  client,
  input,
  warehouse,
}: {
  client: ReturnType<typeof scopedClient>;
  input: ReturnType<typeof listInput>;
  warehouse: WarehouseResult;
}) {
  const result = await resultOf(inventoryPage(client, input));
  if (!result.data) return <DataError message={result.error} />;
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {result.data.inventory_items.length ? (
          result.data.inventory_items.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <CardTitle>{item.title || item.sku || item.id}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  SKU de inventario: {item.sku || "Sin SKU"}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <Suspense fallback={<StockSkeleton />}>
                  <InventoryStock item={item} warehouse={warehouse} />
                </Suspense>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <DataEmpty
              title={
                input.q ? "Sin coincidencias" : "Sin artículos de inventario"
              }
              description="Los artículos aparecerán al crear ofertas con inventario en tu almacén aprobado."
            />
          </Card>
        )}
      </div>
      <Pagination
        path="/seller/inventory"
        page={input.page}
        count={result.data.count}
        q={input.q}
      />
    </div>
  );
}
