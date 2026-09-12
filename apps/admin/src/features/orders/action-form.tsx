"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { orderAction } from "./actions";
import type { OrderActionState } from "./helpers";

export function OrderActionForm({
  id,
  operation,
  fulfillmentId,
}: {
  id: string;
  operation: "complete" | "deliver";
  fulfillmentId?: string;
}) {
  const [state, action, pending] = useActionState(orderAction, {
    status: "idle",
    message: "",
  } satisfies OrderActionState);
  const label =
    operation === "complete" ? "Completar pedido" : "Marcar como entregado";
  return (
    <form
      action={action}
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <input type="hidden" name="order_id" value={id} />
      <input type="hidden" name="operation" value={operation} />
      {fulfillmentId && (
        <input type="hidden" name="fulfillment_id" value={fulfillmentId} />
      )}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirmed"
          value="yes"
          required
          disabled={pending}
          className="mt-1"
        />
        {operation === "complete"
          ? "Confirmo que todos los artículos fueron entregados y quiero completar este pedido."
          : "Confirmo que el comprador recibió los artículos de este envío."}
      </label>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Actualizando…" : label}
      </Button>
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className="text-sm"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
