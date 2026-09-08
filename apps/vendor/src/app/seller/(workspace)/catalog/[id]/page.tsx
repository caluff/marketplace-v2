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
import { createMasterSku } from "@/features/catalog/master-sku";
import { PresentationControls } from "@/features/catalog/presentation-controls";

export const metadata: Metadata = { title: "Detalle de producto" };
const loading = (
  <div
    role="status"
    className="h-64 animate-pulse rounded-lg bg-muted p-5 text-sm text-muted-foreground"
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
  if (!result.data) return <DataError message={result.error} />;
  const { product } = result.data;
  const changes = (product.changes ?? []).filter(
    (change) => change.created_by === membership.seller.id,
  );
  const hasPending = changes.some((change) => change.status === "pending");
  return (
    <>
      {changes.length ? (
        <details id="solicitudes" className="rounded-xl border bg-card px-5">
          <summary className="cursor-pointer py-4 text-sm font-semibold focus-visible:outline-2">
            Solicitudes de cambios · {changes.length}
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
            <CardTitle>Solicitar cambios de contenido y categorías</CardTitle>
            <StatusBadge status={product.status} />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            El contenido actual se conserva hasta que el operador revise la
            solicitud.
          </p>
        </CardHeader>
        <CardContent>
          {hasPending ? (
            <p className="text-sm text-muted-foreground">
              Ya hay una solicitud pendiente. Espera su resolución para proponer
              otros cambios.
            </p>
          ) : (
            <EditForm product={product} categories={categories} />
          )}
        </CardContent>
      </Card>
      <section className="space-y-4">
        <PresentationControls hasPending={hasPending}>
          <Card>
            <CardHeader>
              <CardTitle>Presentaciones del producto</CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">
                Solicita cambios de tamaños, colores u otras presentaciones. Los
                cambios deben aprobarse antes de usarlos para vender.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {!hasPending ? (
                <section className="space-y-3">
                  <h3 className="font-semibold">Nueva presentación</h3>
                  <VariantForm product={product} />
                </section>
              ) : null}
              <details className="border-t pt-4">
                <summary className="cursor-pointer text-sm text-primary underline underline-offset-4">
                  Editar presentaciones existentes
                </summary>
                <div className="mt-4 space-y-4">
                  {(product.variants ?? []).map((variant) => (
                    <div key={variant.id} className="space-y-3 border-b pb-5">
                      <p className="font-medium">{variant.title} </p>
                      {!hasPending ? (
                        <details>
                          <summary className="cursor-pointer text-sm text-primary">
                            Editar presentación
                          </summary>
                          <div className="pt-4">
                            <VariantForm
                              product={product}
                              variant={variant}
                              defaultSku={
                                variant.sku || createMasterSku(variant.title)
                              }
                            />
                          </div>
                        </details>
                      ) : null}
                    </div>
                  ))}
                  {!product.variants?.length ? (
                    <p className="text-sm text-muted-foreground">
                      Sin presentaciones aprobadas.
                    </p>
                  ) : null}
                </div>
              </details>
              {(product.attributes ?? [])
                .filter((attribute) => attribute.is_variant_axis)
                .map((attribute) => (
                  <div key={attribute.id} className="space-y-3 border-t pt-4">
                    <p className="font-medium">{attribute.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {attribute.values?.map((value) => value.name).join(", ")}
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
                            submit="Enviar valores a revisión"
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
        <Suspense fallback={loading}>
          <ProductOffers product={product} configuration={configuration} />
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
