import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import type { HttpTypes } from "@mercurjs/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DataEmpty,
  DataError,
  PageHeading,
  Pagination,
  SearchForm,
} from "@/features/workspace/components";
import { MutationForm } from "@/features/workspace/mutation-form";
import { updateStockAction } from "@/features/workspace/actions";
import {
  inventoryLevels,
  resultOf,
  workspace,
} from "@/features/workspace/data";
import { listInput } from "@/features/workspace/presentation";

export const metadata: Metadata = { title: "Inventario" };
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { client } = await workspace();
  const input = listInput(await searchParams);
  const result = await resultOf(
    client.get<HttpTypes.VendorInventoryItemListResponse>(
      "/vendor/inventory-items",
      {
        q: input.q || undefined,
        limit: input.limit,
        offset: input.offset,
        fields: "id,title,sku",
      },
    ),
  );
  const itemLevels = new Map(
    await Promise.all(
      (result.data?.inventory_items ?? []).map(
        async (item) =>
          [item.id, await resultOf(inventoryLevels(client, item.id))] as const,
      ),
    ),
  );
  const locationIds = [
    ...new Set(
      [...itemLevels.values()].flatMap(
        (result) => result.data?.map((level) => level.location_id) ?? [],
      ),
    ),
  ];
  const locations = new Map(
    await Promise.all(
      locationIds.map(
        async (id) =>
          [
            id,
            await resultOf(
              client.get<HttpTypes.VendorStockLocationResponse>(
                `/vendor/stock-locations/${id}`,
                { fields: "id,name" },
              ),
            ),
          ] as const,
      ),
    ),
  );
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Inventario"
        title="Existencias por ubicación"
        description="Consulta el stock físico, las reservas y la disponibilidad. Cada ajuste reemplaza el total físico de una ubicación existente; no modifica las reservas."
      >
        <Button asChild variant="outline" className="h-11">
          <Link href="/seller/inventory/locations">Gestionar ubicaciones</Link>
        </Button>
      </PageHeading>
      <SearchForm q={input.q} label="Buscar por artículo o SKU" />
      {result.data ? (
        <>
          <div className="space-y-4">
            {result.data.inventory_items.length ? (
              result.data.inventory_items.map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <CardTitle>{item.title || item.sku || item.id}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      SKU: {item.sku || "Sin SKU"}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {itemLevels.get(item.id)?.error ? (
                      <p role="alert" className="text-sm text-destructive">
                        {itemLevels.get(item.id)?.error}
                      </p>
                    ) : itemLevels.get(item.id)?.data?.length ? (
                      itemLevels.get(item.id)!.data!.map((level) => {
                        const location = locations.get(level.location_id);
                        return (
                          <div
                            key={level.id}
                            className="rounded-lg border border-border/70 p-4"
                          >
                            <div className="mb-4 flex flex-wrap justify-between gap-3">
                              <p className="text-sm font-semibold">
                                {location?.data?.stock_location.name ??
                                  "Ubicación no disponible"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Físico: {Number(level.stocked_quantity)} ·
                                Reservado: {Number(level.reserved_quantity)} ·
                                Disponible:{" "}
                                {Number(
                                  level.available_quantity ??
                                    Number(level.stocked_quantity) -
                                      Number(level.reserved_quantity),
                                )}
                              </p>
                            </div>
                            {location?.data ? (
                              <MutationForm
                                action={updateStockAction}
                                submit="Actualizar existencias"
                                hidden={{
                                  id: item.id,
                                  location_id: level.location_id,
                                  expected_quantity: String(
                                    level.stocked_quantity,
                                  ),
                                }}
                                fields={[
                                  {
                                    name: "stocked_quantity",
                                    label: "Nuevo total físico",
                                    type: "number",
                                    value: String(level.stocked_quantity),
                                    required: true,
                                    min: Math.max(
                                      0,
                                      Number(level.reserved_quantity),
                                    ),
                                  },
                                ]}
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                {location?.error ??
                                  "No se pudo verificar esta ubicación."}{" "}
                                No se puede ajustar el stock hasta verificar su
                                acceso.
                              </p>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm leading-6 text-muted-foreground">
                        Sin ubicaciones configuradas. Solicita al operador
                        vincular el artículo a una ubicación de esta tienda para
                        poder ajustar sus existencias.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <DataEmpty
                  title={
                    input.q
                      ? "Sin coincidencias"
                      : "Sin artículos de inventario"
                  }
                  description="El inventario aparecerá cuando se vinculen artículos y ubicaciones a tu tienda."
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
        </>
      ) : (
        <DataError message={result.error} />
      )}
    </div>
  );
}
