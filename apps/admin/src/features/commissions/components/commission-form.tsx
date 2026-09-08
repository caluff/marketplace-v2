"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { CommissionRateDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { withFeedbackToast } from "@/lib/feedback";
import { updateCommissionAction } from "../actions";

export function CommissionRefresh() {
  const router = useRouter();
  return (
    <Button variant="outline" onClick={() => router.refresh()}>
      Actualizar estado
    </Button>
  );
}

export function CommissionForm({
  rate,
}: {
  rate: Pick<CommissionRateDTO, "id" | "value">;
}) {
  const [state, action, isPending] = useActionState(
    withFeedbackToast(updateCommissionAction),
    { status: "idle" },
  );
  return (
    <form action={action} className="space-y-4" aria-busy={isPending}>
      <input type="hidden" name="rate_id" value={rate.id} />
      <input type="hidden" name="expected_value" value={rate.value} />
      <Field>
        <FieldLabel htmlFor="commission-percentage">
          Porcentaje global (%)
        </FieldLabel>
        <Input
          id="commission-percentage"
          name="percentage"
          type="number"
          min="0"
          max="100"
          step="any"
          required
          defaultValue={rate.value}
          disabled={isPending || state.status === "success"}
          aria-describedby="commission-percentage-help"
          className="max-w-48 tabular-nums"
        />
        <FieldDescription id="commission-percentage-help">
          De 0 a 100. Se aplica cuando no coincide una tasa más específica.
        </FieldDescription>
      </Field>
      <Button type="submit" disabled={isPending || state.status === "success"}>
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {isPending ? "Guardando…" : "Guardar porcentaje"}
      </Button>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
