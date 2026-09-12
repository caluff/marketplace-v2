import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { listProductsForReview } from "../data";
import {
  parseProductReviewFilters,
  PRODUCT_STATUS_LABELS,
  productReviewHref,
} from "../helpers";
import { ProductReviewList } from "./product-list";

export function ProductReviewSkeleton() {
  return <Skeleton className="h-80 w-full" aria-label="Cargando productos" />;
}

async function ProductReviewResults({
  filters,
}: {
  filters: ReturnType<typeof parseProductReviewFilters>;
}) {
  let result;
  try {
    result = await listProductsForReview(filters);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <div role="alert" className="space-y-3 rounded-lg border p-6">
        <p>
          No pudimos cargar los productos. Comprueba la conexión y los permisos
          de tu cuenta.
        </p>
        <Button asChild variant="outline">
          <a href={productReviewHref(filters, filters.offset)}>Reintentar</a>
        </Button>
      </div>
    );
  }
  return <ProductReviewList filters={filters} result={result} />;
}

export async function ProductReviewBrowser({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseProductReviewFilters(await searchParams);
  return (
    <>
      <form
        action="/dashboard/product-review"
        className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_220px_auto]"
      >
        <Field>
          <FieldLabel htmlFor="product-search">Buscar producto</FieldLabel>
          <Input
            key={filters.q}
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
            key={filters.status}
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
      <Suspense
        key={`${filters.status}:${filters.q}:${filters.offset}`}
        fallback={<ProductReviewSkeleton />}
      >
        <ProductReviewResults filters={filters} />
      </Suspense>
    </>
  );
}
