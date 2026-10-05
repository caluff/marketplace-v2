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
      className="min-h-64 p-5"
      role="status"
      aria-label="Cargando comisión global"
      aria-busy="true"
    >
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-10 w-48 rounded bg-muted" />
        <div className="h-10 w-40 rounded bg-muted" />
        <div className="h-5 w-36 rounded bg-muted" />
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
            No hay una comisión predeterminada disponible para editar.
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
          <CardTitle>Comisión global</CardTitle>
          <Badge>{rate.is_enabled ? "Activa" : "Inactiva"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {canEditCommission(rate) ? (
          <CommissionForm
            key={`${rate.id}:${rate.value}`}
            rate={{ id: rate.id, value: rate.value }}
          />
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Esta comisión está inactiva o tiene condiciones específicas y no se
            puede editar aquí.
          </p>
        )}
        <details className="border-t border-border pt-4 text-sm">
          <summary className="w-fit cursor-pointer font-medium outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
            Cómo se calcula
          </summary>
          <div className="mt-3 space-y-3 leading-6 text-muted-foreground">
            <p>
              Se aplica cuando no hay una comisión más específica.{" "}
              {commissionBaseDescription(rate)}
            </p>
            <p>
              Si un pedido cambia después, su comisión puede recalcularse con el
              porcentaje vigente, incluso para pedidos existentes.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
