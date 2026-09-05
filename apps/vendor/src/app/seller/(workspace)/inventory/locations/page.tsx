import type { Metadata } from "next";
import type { HttpTypes } from "@mercurjs/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DataEmpty,
  DataError,
  PageHeading,
  Pagination,
} from "@/features/workspace/components";
import { MutationForm } from "@/features/workspace/mutation-form";
import { createLocationAction } from "@/features/workspace/actions";
import { resultOf, workspace } from "@/features/workspace/data";
import { listInput } from "@/features/workspace/presentation";

export const metadata: Metadata = { title: "Ubicaciones" };
export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { client } = await workspace();
  const input = listInput(await searchParams);
  const result = await resultOf(
    client.get<HttpTypes.VendorStockLocationListResponse>(
      "/vendor/stock-locations",
      { limit: input.limit, offset: input.offset, fields: "id,name,address.*" },
    ),
  );
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeading
        eyebrow="Inventario"
        title="Ubicaciones de la tienda"
        description="Registra dónde se encuentran tus existencias. Una ubicación de inventario no habilita por sí sola los métodos de envío."
      />
      {result.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Ubicaciones existentes</CardTitle>
          </CardHeader>
          <CardContent>
            {result.data.stock_locations.length ? (
              <ul className="divide-y divide-border">
                {result.data.stock_locations.map((location) => (
                  <li key={location.id} className="py-3">
                    <p className="text-sm font-semibold">{location.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[
                        location.address?.address_1,
                        location.address?.city,
                        location.address?.country_code?.toUpperCase(),
                      ]
                        .filter(Boolean)
                        .join(", ") || "Sin dirección"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <DataEmpty
                title="Todavía no hay ubicaciones"
                description="Crea la primera ubicación de inventario para tu tienda."
              />
            )}
          </CardContent>
          <Pagination
            path="/seller/inventory/locations"
            page={input.page}
            count={result.data.count}
          />
        </Card>
      ) : (
        <DataError message={result.error} />
      )}
      <Card>
        <CardHeader>
          <CardTitle>Nueva ubicación</CardTitle>
          <p className="text-sm text-muted-foreground">País: Estados Unidos</p>
        </CardHeader>
        <CardContent>
          <MutationForm
            action={createLocationAction}
            submit="Crear ubicación"
            hidden={{ country_code: "us" }}
            fields={[
              { name: "name", label: "Nombre", required: true, maxLength: 200 },
              { name: "address_1", label: "Dirección", required: true },
              { name: "city", label: "Ciudad", required: true },
              {
                name: "postal_code",
                label: "Código postal",
                required: true,
                maxLength: 30,
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
