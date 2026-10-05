import type { Metadata } from "next";
import type { ProductDTO } from "@mercurjs/types";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DataError,
  PageHeading,
  StatusBadge,
} from "@/features/workspace/components";
import { editProductAction } from "@/features/workspace/actions";
import { productDetail, resultOf, workspace } from "@/features/workspace/data";
import { formatDate } from "@/features/workspace/presentation";
import { MutationForm } from "@/features/workspace/mutation-form";
import {
  CategoryFields,
  type CategoryResult,
} from "@/features/catalog/category-fields";
import { catalogCategories } from "@/features/catalog/data";
import { ProductForm } from "@/features/catalog/product-form";
import { VariantForm } from "@/features/catalog/variant-form";
import { extendAxisAction } from "@/features/catalog/actions";
import { ProductOffers } from "@/features/offers/product-offers";
import { offerConfiguration } from "@/features/offers/data";
import { PresentationControls } from "@/features/catalog/presentation-controls";
import { hasPresentationOptions } from "@/features/catalog/variant-options";
import { CatalogAutoRefresh } from "@/features/catalog/auto-refresh";

export const metadata: Metadata = { title: "Detalle de producto" };
const loading = (
  <div
    role="status"
    className="h-64 motion-safe:animate-pulse rounded-lg bg-muted p-5 text-sm text-muted-foreground"
  >
    Cargando datos…
  </div>
);
function EditForm({
  product,
  categories,
}: {
  product: ProductDTO;
  categories: CategoryResult;
}) {
  return (
    <ProductForm
      product={product}
      action={editProductAction}
      categories={
        <Suspense
          fallback={
            <p role="status" className="h-24 text-sm text-muted-foreground">
              Cargando categorías…
            </p>
          }
        >
          <CategoryFields
            categories={categories}
            selected={product.categories?.map((category) => category.id)}
          />
        </Suspense>
      }
    />
  );
}
async function ProductContent({ id }: { id: string }) {
  const { client, membership } = await workspace();
  // Handle an early category failure even when product detail fails or editing is pending.
  const categories = resultOf(catalogCategories(client));
  const configuration = resultOf(offerConfiguration(client));
  const result = await resultOf(productDetail(id));
  if (!result.data)
    return (
      <>
        <CatalogAutoRefresh sellerId={membership.seller.id} />
        <DataError message={result.error} />
      </>
    );
  const { product } = result.data;
  const changes = (product.changes ?? []).filter(
    (change) => change.created_by === membership.seller.id,
  );
  const hasPending = changes.some((change) => change.status === "pending");
  const hasOptions = hasPresentationOptions(product);
  return (
    <>
      <CatalogAutoRefresh sellerId={membership.seller.id} />
      {changes.length ? (
        <details id="solicitudes" className="rounded-xl border bg-card px-5">
          <summary className="cursor-pointer py-4 text-sm font-semibold focus-visible:outline-2">
            Historial de cambios · {changes.length}
            {hasPending ? " · Pendiente de revisión" : " · Ver historial"}
          </summary>
          <div className="max-h-72 space-y-3 overflow-y-auto border-t py-4">
            {changes.map((change) => (
              <div
                key={change.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
              >
                <div>
                  <p className="text-sm">{formatDate(change.created_at)}</p>
                  {change.external_note || change.declined_reason ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {change.external_note ?? change.declined_reason}
                    </p>
                  ) : null}
                </div>
                <StatusBadge status={change.status} />
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle>Datos del producto</CardTitle>
            <StatusBadge status={product.status} />
          </div>
        </CardHeader>
        <CardContent>
          {hasPending ? (
            <p className="text-sm text-muted-foreground">
              Ya hay una solicitud pendiente. Espera su resolución para guardar
              otros cambios.
            </p>
          ) : (
            <EditForm product={product} categories={categories} />
          )}
        </CardContent>
      </Card>
      <section className="space-y-4">
        {hasOptions ? (
          <PresentationControls hasPending={hasPending}>
            <Card>
              <CardHeader>
                <CardTitle>Nueva presentación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {!hasPending ? (
                  <section className="space-y-3">
                    <VariantForm product={product} />
                  </section>
                ) : null}
                {(product.attributes ?? [])
                  .filter((attribute) => attribute.is_variant_axis)
                  .map((attribute) => (
                    <div key={attribute.id} className="space-y-3 border-t pt-4">
                      <p className="font-medium">{attribute.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {attribute.values
                          ?.map((value) => value.name)
                          .join(", ")}
                      </p>
                      {!hasPending ? (
                        <details>
                          <summary className="cursor-pointer text-sm text-primary">
                            Añadir valores de {attribute.name.toLowerCase()}
                          </summary>
                          <div className="pt-4">
                            <MutationForm
                              action={extendAxisAction}
                              hidden={{
                                id: product.id,
                                attribute_id: attribute.id,
                              }}
                              submit="Guardar valores"
                              disableAfterSuccess
                              fields={[
                                {
                                  name: "values",
                                  label: "Valores separados por comas",
                                  required: true,
                                  maxLength: 3000,
                                },
                              ]}
                            />
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ))}
              </CardContent>
            </Card>
          </PresentationControls>
        ) : (
          <h2 className="text-xl font-semibold">Presentaciones y precios</h2>
        )}
        <Suspense fallback={loading}>
          <ProductOffers
            product={product}
            configuration={configuration}
            hasPending={hasPending}
          />
        </Suspense>
      </section>
    </>
  );
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Catálogo" title="Detalle de producto" />
      <Suspense fallback={loading}>
        <ProductContent id={id} />
      </Suspense>
    </div>
  );
}
