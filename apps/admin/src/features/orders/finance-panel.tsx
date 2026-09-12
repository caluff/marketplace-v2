"use client";

import type {
  OrderFinanceInput,
  OrderFinanceResponse,
} from "@marketplace-v2/api/finance-contracts";
import { useActionState, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { money } from "./helpers";
import { OrderFinanceHistory } from "./finance-history";
import { orderFinanceAction } from "./finance-actions";
import {
  financePayload,
  financeRequest,
  type FinanceActionState,
} from "./finance-form";

export function OrderFinancePanel({ data }: { data: OrderFinanceResponse }) {
  const id = useId();
  const request = useRef<ReturnType<typeof financeRequest> | null>(null);
  const [operation, setOperation] = useState<OrderFinanceInput["action"]>(
    data.finance.capture.allowed
      ? "capture"
      : data.finance.refund.allowed
        ? "refund"
        : "cancel",
  );
  const [refundMode, setRefundMode] = useState("full");
  const [note, setNote] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, isPending] = useActionState(
    async (previous: FinanceActionState, form: FormData) => {
      request.current = financeRequest(form, request.current, () =>
        crypto.randomUUID(),
      );
      form.set("request_id", request.current.id);
      try {
        financePayload(form);
      } catch (error) {
        return {
          status: "error" as const,
          message:
            error instanceof Error
              ? error.message
              : "Revisa los datos de la solicitud.",
        };
      }
      let result: FinanceActionState;
      try {
        result = await orderFinanceAction(
          data.finance.order_id,
          previous,
          form,
        );
      } catch {
        return {
          status: "error" as const,
          message:
            "Se interrumpió la conexión. Reintenta con los mismos datos para consultar la misma solicitud.",
        };
      }
      if (result.status === "success") request.current = null;
      return result;
    },
    { status: "idle" },
  );
  const finance = state.data?.finance ?? data.finance;
  const eligibility =
    operation === "capture"
      ? finance.capture
      : operation === "cancel"
        ? finance.cancellation
        : finance.refund;
  const amount =
    operation === "capture"
      ? finance.capture.amount
      : operation === "cancel"
        ? finance.cancellation.refund_amount
        : finance.refundable_total;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Finanzas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {[
            ["Asignado al pedido", finance.allocated_total],
            ["Cobrado de este pedido", finance.captured_total],
            ["Reembolsado", finance.refunded_total],
            ["Disponible para reembolso", finance.refundable_total],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono font-medium">
                {money(Number(value), finance.currency_code)}
              </dd>
            </div>
          ))}
        </dl>
        <form action={action} className="space-y-4">
          <fieldset
            disabled={isPending || state.status === "success"}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label htmlFor={`${id}-action`} className="text-sm font-medium">
                Operación
              </label>
              <select
                id={`${id}-action`}
                name="action"
                value={operation}
                onChange={(event) => {
                  setOperation(
                    event.target.value as OrderFinanceInput["action"],
                  );
                  setConfirmed(false);
                }}
                className="h-11 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="capture">Cobrar compra</option>
                <option value="refund">Reembolsar</option>
                <option value="cancel">Cancelar pedido</option>
              </select>
            </div>
            {!eligibility.allowed ? (
              <p role="status" className="text-sm text-muted-foreground">
                {eligibility.reason ||
                  "Esta operación no está disponible para el pedido."}
              </p>
            ) : (
              <>
                {operation === "refund" ? (
                  <div className="space-y-3">
                    <label
                      htmlFor={`${id}-mode`}
                      className="text-sm font-medium"
                    >
                      Importe del reembolso
                    </label>
                    <select
                      id={`${id}-mode`}
                      value={refundMode}
                      onChange={(event) => {
                        setRefundMode(event.target.value);
                        setConfirmed(false);
                      }}
                      className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="full">Todo el saldo disponible</option>
                      <option value="partial">Importe parcial</option>
                    </select>
                    {refundMode === "partial" ? (
                      <>
                        <label htmlFor={`${id}-amount`} className="text-sm">
                          Importe en {finance.currency_code.toUpperCase()}
                        </label>
                        <Input
                          id={`${id}-amount`}
                          name="amount"
                          value={partialAmount}
                          onChange={(event) => {
                            setPartialAmount(event.target.value);
                            setConfirmed(false);
                          }}
                          type="number"
                          min={0.01}
                          max={finance.refundable_total}
                          step="0.01"
                          required
                        />
                      </>
                    ) : (
                      <input
                        type="hidden"
                        name="amount"
                        value={finance.refundable_total}
                      />
                    )}
                    <p className="text-sm text-muted-foreground">
                      Máximo:{" "}
                      {money(finance.refundable_total, finance.currency_code)}
                    </p>
                  </div>
                ) : operation === "capture" ? (
                  <div className="space-y-2 text-sm">
                    <p>
                      Importe a cobrar de la compra:{" "}
                      <strong>{money(amount, finance.currency_code)}</strong>
                    </p>
                    <p className="text-muted-foreground">
                      Incluye todos los pedidos activos de esta compra
                      compartida, también los de otros vendedores. Excluye los
                      pedidos cancelados. El servidor calcula el importe final.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm">
                    Reembolso al cancelar:{" "}
                    <strong>{money(amount, finance.currency_code)}</strong>
                  </p>
                )}
                <div className="space-y-2">
                  <label htmlFor={`${id}-note`} className="text-sm font-medium">
                    Motivo
                  </label>
                  <textarea
                    id={`${id}-note`}
                    name="note"
                    value={note}
                    onChange={(event) => {
                      setNote(event.target.value);
                      setConfirmed(false);
                    }}
                    minLength={3}
                    maxLength={500}
                    required
                    rows={3}
                    className="w-full rounded-md border bg-background p-3 text-sm"
                  />
                </div>
                <label className="flex items-start gap-2 text-sm leading-6">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                    name="confirm"
                    value="yes"
                    required
                    className="mt-1 size-4 shrink-0"
                  />
                  {operation === "capture"
                    ? "Autorizo el cobro indicado de todos los pedidos activos de la compra, excluidos los cancelados."
                    : operation === "cancel"
                      ? "Confirmo la cancelación del pedido y el importe indicado."
                      : "Confirmo el importe y autorizo este reembolso."}
                </label>
                <Button
                  type="submit"
                  variant="outline"
                  className={
                    operation === "capture"
                      ? "min-h-11"
                      : "min-h-11 border-destructive/40 text-destructive"
                  }
                >
                  {isPending
                    ? "Procesando…"
                    : operation === "capture"
                      ? "Cobrar compra"
                      : operation === "cancel"
                        ? "Confirmar cancelación"
                        : "Confirmar reembolso"}
                </Button>
              </>
            )}
          </fieldset>
          {state.message ? (
            <p
              role={state.status === "error" ? "alert" : "status"}
              className="text-sm"
            >
              {state.message}
            </p>
          ) : null}
        </form>
        <OrderFinanceHistory finance={finance} />
      </CardContent>
    </Card>
  );
}
