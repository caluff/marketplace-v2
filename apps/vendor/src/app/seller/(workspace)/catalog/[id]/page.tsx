import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DataError,
  PageHeading,
  StatusBadge,
} from "@/features/workspace/components";
import { MutationForm } from "@/features/workspace/mutation-form";
import { editProductAction } from "@/features/workspace/actions";
import { productDetail, resultOf, workspace } from "@/features/workspace/data";
import { formatDate } from "@/features/workspace/presentation";

export const metadata: Metadata = { title: "Detalle de producto" };
export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { membership } = await workspace();
  const result = await resultOf(productDetail((await params).id));
  if (!result.data) return <DataError message={result.error} />;
  const { product } = result.data;
  const changes = (product.changes ?? [])
    .filter((change) => change.created_by === membership.seller.id)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Catálogo"
        title={product.title}
        description={`Referencia: ${product.id}. La información del formulario corresponde al producto actual.`}
      >
        <StatusBadge status={product.status} />
      </PageHeading>
      {product.status === "draft" ? <p className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm leading-6">Este producto sigue en borrador. Puedes solicitar cambios en su contenido; el operador debe gestionar su paso a revisión.</p> : null}
      {changes.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes de esta tienda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {changes.map((change) => (
              <div
                key={change.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3"
              >
                <div>
                  <p className="text-sm">
                    {formatDate(change.created_at)} · {change.id}
                  </p>
                  {change.external_note || change.declined_reason ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {change.external_note ?? change.declined_reason}
                    </p>
                  ) : null}
                </div>
                <StatusBadge status={change.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Solicitar cambios</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">
            Los cambios quedan pendientes de aprobación. El producto actual
            conserva su contenido hasta la revisión del operador.
          </p>
        </CardHeader>
        <CardContent>
          <MutationForm
            action={editProductAction}
            hidden={{ id: product.id }}
            submit="Enviar cambios a aprobación"
            fields={[
              {
                name: "title",
                label: "Nombre",
                value: product.title,
                required: true,
                maxLength: 200,
              },
              {
                name: "subtitle",
                label: "Subtítulo",
                value: product.subtitle ?? "",
                maxLength: 200,
              },
              {
                name: "description",
                label: "Descripción",
                type: "textarea",
                value: product.description ?? "",
                maxLength: 10000,
              },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Variantes actuales</CardTitle>
        </CardHeader>
        {product.variants?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Variante</TableHead>
                <TableHead>SKU</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {product.variants.map((variant) => (
                <TableRow key={variant.id}>
                  <TableCell>{variant.title}</TableCell>
                  <TableCell>{variant.sku || "Sin SKU"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              El producto todavía no tiene variantes.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
