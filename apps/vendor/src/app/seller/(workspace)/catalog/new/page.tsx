import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeading } from "@/features/workspace/components";
import { MutationForm } from "@/features/workspace/mutation-form";
import { createProductAction } from "@/features/workspace/actions";
import { workspace } from "@/features/workspace/data";

export const metadata: Metadata = { title: "Crear producto" };
export default async function NewProductPage() {
  await workspace();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeading
        eyebrow="Catálogo"
        title="Crear producto"
        description="Prepara la información del producto. Al crearlo se envía a aprobación; la publicación requiere revisión."
      />
      <Card>
        <CardHeader>
          <CardTitle>Información del producto</CardTitle>
        </CardHeader>
        <CardContent>
          <MutationForm
            action={createProductAction}
            submit="Enviar a revisión"
            disableAfterSuccess
            hidden={{ status: "proposed" }}
            fields={[
              {
                name: "title",
                label: "Nombre",
                required: true,
                maxLength: 200,
              },
              { name: "subtitle", label: "Subtítulo", maxLength: 200 },
              {
                name: "description",
                label: "Descripción",
                type: "textarea",
                maxLength: 10000,
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
