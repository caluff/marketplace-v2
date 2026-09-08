import { FetchError } from "@medusajs/js-sdk";
import { unstable_rethrow } from "next/navigation";
import { FeedbackToast } from "@/components/feedback-toast";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdminSdk } from "@/lib/auth-sdk";
import {
  canEditCommission,
  commissionBaseDescription,
  commissionErrorMessage,
} from "../helpers";
import { readDefaultCommission } from "../operations";
import { CommissionForm, CommissionRefresh } from "./commission-form";

export function CommissionSkeleton() {
  return (
    <Card
      className="min-h-96 p-5"
      role="status"
      aria-label="Cargando comisión global"
      aria-busy="true"
    >
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-16 rounded bg-muted" />
        <div className="h-10 w-48 rounded bg-muted" />
        <div className="h-10 w-40 rounded bg-muted" />
      </div>
      <span className="sr-only">Cargando comisión global…</span>
    </Card>
  );
}

export async function CommissionPanel() {
  let rate;
  try {
    const sdk = await requireAdminSdk();
    rate = await readDefaultCommission(sdk.client);
  } catch (error) {
    unstable_rethrow(error);
    const message = commissionErrorMessage(
      error instanceof FetchError ? error.status : undefined,
    );
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comisión no disponible</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FeedbackToast status="error" message={message} />
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
          <CommissionRefresh />
        </CardContent>
      </Card>
    );
  }
  if (!rate)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin comisión global configurada</CardTitle>
          <CardDescription>
            No se encontró una tasa predeterminada en Mercur. Esta sección
            permite editar una tasa existente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CommissionRefresh />
        </CardContent>
      </Card>
    );
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Comisión global predeterminada</CardTitle>
          <Badge>{rate.is_enabled ? "Activa" : "Inactiva"}</Badge>
        </div>
        <CardDescription>{rate.name}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6">
          <p className="font-medium">Base de cálculo vigente</p>
          <p className="text-muted-foreground">
            {commissionBaseDescription(rate)}
          </p>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Mercur puede recalcular las comisiones con las tasas vigentes ante
          cambios posteriores en un pedido. El porcentaje no queda garantizado
          como una condición inmutable para pedidos existentes.
        </p>
        {canEditCommission(rate) ? (
          <CommissionForm
            key={`${rate.id}:${rate.value}`}
            rate={{ id: rate.id, value: rate.value }}
          />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            La tasa existente no es una comisión global porcentual activa sin
            restricciones. No está disponible para editar desde esta sección.
          </p>
        )}
        <div className="border-t border-border pt-4">
          <CommissionRefresh />
        </div>
      </CardContent>
    </Card>
  );
}
