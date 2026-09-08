import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeading } from "@/features/workspace/components";
import { createProductAction } from "@/features/workspace/actions";
import { workspace } from "@/features/workspace/data";
import { CategoryFields } from "@/features/catalog/category-fields";
import { ProductForm } from "@/features/catalog/product-form";

export const metadata: Metadata = { title: "Crear producto" };

export default async function NewProductPage() {
  await workspace();
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeading
        eyebrow="Catálogo"
        title="Crear producto"
        description="Prepara un producto con sus variantes. Los SKU maestros se generan automáticamente y todo se revisa antes de publicarse."
      />
      <Card>
        <CardHeader>
          <CardTitle>Información y variantes</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductForm
            action={createProductAction}
            categories={
              <Suspense
                fallback={
                  <p
                    role="status"
                    className="h-24 text-sm text-muted-foreground"
                  >
                    Cargando categorías…
                  </p>
                }
              >
                <CategoryFields />
              </Suspense>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
