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
import type { retrieveProductForReview } from "@/features/product-review/data";
import { PRODUCT_STATUS_LABELS } from "@/features/product-review/helpers";
import { ProductModerationForm } from "@/features/product-review/components/review-form";

export function ProductReviewDetail({
  product,
  productChange,
}: Awaited<ReturnType<typeof retrieveProductForReview>>) {
  const updatedAt = product.updated_at
    ? new Date(product.updated_at).toISOString()
    : "";
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/product-review">← Revisión de productos</Link>
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {product.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{product.handle}</p>
        </div>
        <Badge variant="outline">
          {PRODUCT_STATUS_LABELS[product.status] ?? product.status}
        </Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Contenido actual</CardTitle>
          <CardDescription>
            Los cambios pendientes de abajo aún no forman parte de este
            contenido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Descripción</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm leading-6">
                {product.description || "Sin descripción"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Categorías</dt>
              <dd className="mt-1 text-sm">
                {product.categories
                  ?.map((category) => category.name)
                  .join(", ") || "Sin categorías"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Variantes</dt>
              <dd className="mt-1 text-sm">
                {product.variants?.map((variant) => variant.title).join(", ") ||
                  "Sin variantes"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      {productChange && (
        <Card>
          <CardHeader>
            <CardTitle>Cambios pendientes</CardTitle>
            <CardDescription>
              Revisión {productChange.id}. Revisa cada operación antes de
              aplicarla.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {productChange.external_note && (
              <p className="text-sm">{productChange.external_note}</p>
            )}
            <ol className="space-y-4">
              {productChange.actions
                ?.slice()
                .sort((left, right) => left.ordering - right.ordering)
                .map((action) => (
                  <li key={action.id}>
                    <h3 className="mb-2 text-sm font-semibold">
                      {action.action}
                    </h3>
                    <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted p-4 text-xs">
                      {JSON.stringify(action.details, null, 2)}
                    </pre>
                  </li>
                ))}
            </ol>
            <ProductModerationForm
              key={productChange.id}
              productId={product.id}
              updatedAt={updatedAt}
              changeId={productChange.id}
            />
          </CardContent>
        </Card>
      )}
      {product.status === "proposed" && !productChange && (
        <Card>
          <CardHeader>
            <CardTitle>Decidir publicación</CardTitle>
            <CardDescription>
              Comprueba la información comercial y las categorías antes de
              publicar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProductModerationForm
              key={updatedAt}
              productId={product.id}
              updatedAt={updatedAt}
            />
          </CardContent>
        </Card>
      )}
      {product.changes?.some((change) => change.external_note) && (
        <Card>
          <CardHeader>
            <CardTitle>Comentarios registrados</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {product.changes
                .filter((change) => change.external_note)
                .map((change) => (
                  <li
                    key={change.id}
                    className="whitespace-pre-wrap text-sm leading-6"
                  >
                    {change.external_note}
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {!productChange && product.status !== "proposed" && (
        <p className="text-sm text-muted-foreground">
          No hay una revisión pendiente que resolver para este producto.
        </p>
      )}
    </div>
  );
}
