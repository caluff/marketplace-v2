"use client";

import { useActionState, useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { updateOrderAction } from "./actions";

export function OrderActionForm({
  orderId,
  action,
  fulfillmentId,
  label,
  confirmation,
  children,
  destructive = false,
}: {
  orderId: string;
  action: string;
  fulfillmentId?: string;
  label: string;
  confirmation?: string;
  children?: ReactNode;
  destructive?: boolean;
}) {
  const id = useId();
  const [state, formAction, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      const result = await updateOrderAction(previous, form);
      notifyFeedback(result);
      return result;
    },
    { status: "idle" },
  );
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="action" value={action} />
      {fulfillmentId ? (
        <input type="hidden" name="fulfillment_id" value={fulfillmentId} />
      ) : null}
      <fieldset
        disabled={isPending || state.status === "success"}
        className="space-y-4"
      >
        {children}
        {confirmation ? (
          <label
            htmlFor={id}
            className="flex items-start gap-2 text-sm leading-6"
          >
            <input
              id={id}
              name="confirmation"
              value="yes"
              type="checkbox"
              required
              className="mt-1 size-4 shrink-0"
            />
            {confirmation}
          </label>
        ) : null}
        <Button
          type="submit"
          variant={destructive ? "outline" : "default"}
          className={`min-h-11 ${destructive ? "border-destructive/40 text-destructive" : ""}`}
        >
          {isPending ? "Actualizando…" : label}
        </Button>
      </fieldset>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={`text-sm ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
