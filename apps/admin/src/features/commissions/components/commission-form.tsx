"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { CommissionRateDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { withFeedbackToast } from "@/lib/feedback";
import { updateCommissionAction } from "../actions";
import { parseCommissionPercentage } from "../helpers";

export function CommissionRefresh() {
  const router = useRouter();
  return (
    <Button type="button" variant="outline" onClick={() => router.refresh()}>
      Reintentar
    </Button>
  );
}

export function CommissionForm({
  rate,
}: {
  rate: Pick<CommissionRateDTO, "id" | "value">;
}) {
  const [percentage, setPercentage] = useState(String(rate.value));
  const [state, action, isPending] = useActionState(
    withFeedbackToast(updateCommissionAction),
    { status: "idle" },
  );
  const hasChanges = parseCommissionPercentage(percentage) !== rate.value;
  return (
    <form action={action} className="space-y-4" aria-busy={isPending}>
      <input type="hidden" name="rate_id" value={rate.id} />
      <input type="hidden" name="expected_value" value={rate.value} />
      <Field>
        <FieldLabel htmlFor="commission-percentage">Porcentaje (%)</FieldLabel>
        <Input
          id="commission-percentage"
          name="percentage"
          type="number"
          min="0"
          max="100"
          step="any"
          required
          value={percentage}
          onChange={(event) => setPercentage(event.target.value)}
          disabled={isPending}
          aria-describedby="commission-percentage-help"
          className="max-w-48 tabular-nums"
        />
        <FieldDescription id="commission-percentage-help">
          Entre 0 y 100 %.
        </FieldDescription>
      </Field>
      <Button type="submit" disabled={isPending || !hasChanges}>
        {isPending ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : null}
        {isPending ? "Guardando…" : "Guardar cambios"}
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
      {state.status === "error" && !isPending ? <CommissionRefresh /> : null}
    </form>
  );
}
