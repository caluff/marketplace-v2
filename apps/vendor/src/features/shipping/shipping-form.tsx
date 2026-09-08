"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { saveShippingAction } from "./actions";

export function ShippingForm({
  profileId,
  optionId,
  name = "",
  description = "",
  amount = "",
  enabled = true,
  isOption = false,
}: {
  profileId?: string;
  optionId?: string;
  name?: string;
  description?: string;
  amount?: string;
  enabled?: boolean;
  isOption?: boolean;
}) {
  const prefix = useId();
  const [values, setValues] = useState({ name, description, amount, enabled });
  const [state, action, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      const result = await saveShippingAction(previous, form);
      notifyFeedback(result);
      if (result.status === "success" && !optionId && (isOption || !profileId))
        setValues({ name: "", description: "", amount: "", enabled: true });
      return result;
    },
    { status: "idle" },
  );
  const operation = isOption
    ? optionId
      ? "update_option"
      : "create_option"
    : profileId
      ? "update_profile"
      : "create_profile";
  const submitLabel = isPending
    ? "Guardando…"
    : isOption
      ? optionId
        ? "Guardar tarifa"
        : "Añadir tarifa"
      : profileId
        ? "Guardar nombre"
        : "Crear perfil";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="action" value={operation} />
      {profileId ? (
        <input
          type="hidden"
          name={isOption ? "shipping_profile_id" : "profile_id"}
          value={profileId}
        />
      ) : null}
      {optionId ? (
        <input type="hidden" name="option_id" value={optionId} />
      ) : null}
      <input type="hidden" name="enabled" value={String(values.enabled)} />
      <fieldset
        disabled={isPending}
        className={isOption ? "grid gap-4 sm:grid-cols-2" : undefined}
      >
        {isOption ? (
          <>
            <Field>
              <FieldLabel htmlFor={`${prefix}-name`}>
                Nombre del envío
              </FieldLabel>
              <Input
                id={`${prefix}-name`}
                name="name"
                required
                maxLength={100}
                value={values.name}
                onChange={(event) =>
                  setValues({ ...values, name: event.target.value })
                }
                placeholder="Envío estándar"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-amount`}>
                Tarifa fija (USD)
              </FieldLabel>
              <Input
                id={`${prefix}-amount`}
                name="amount"
                type="number"
                aria-describedby={`${prefix}-amount-help`}
                min={0}
                max={1000000}
                step="0.01"
                required
                value={values.amount}
                onChange={(event) =>
                  setValues({ ...values, amount: event.target.value })
                }
              />
              <FieldDescription id={`${prefix}-amount-help`}>
                Introduce 0 para ofrecer envío gratis.
              </FieldDescription>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={`${prefix}-description`}>
                Plazo y condiciones para el comprador
              </FieldLabel>
              <Input
                id={`${prefix}-description`}
                name="description"
                required
                maxLength={500}
                value={values.description}
                onChange={(event) =>
                  setValues({ ...values, description: event.target.value })
                }
                placeholder="Por ejemplo: entrega en 3 a 5 días hábiles"
              />
            </Field>
            {optionId ? (
              <Field className="sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${prefix}-enabled`}
                    aria-describedby={`${prefix}-enabled-help`}
                    checked={values.enabled}
                    onCheckedChange={(checked) =>
                      setValues({ ...values, enabled: checked === true })
                    }
                  />
                  <FieldLabel htmlFor={`${prefix}-enabled`}>
                    Disponible para nuevas compras
                  </FieldLabel>
                </div>
                <FieldDescription id={`${prefix}-enabled-help`}>
                  Desactivarla conserva los envíos de pedidos ya realizados.
                </FieldDescription>
              </Field>
            ) : null}
          </>
        ) : (
          <Field>
            <FieldLabel htmlFor={`${prefix}-name`}>
              Nombre del perfil
            </FieldLabel>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                id={`${prefix}-name`}
                name="name"
                required
                maxLength={100}
                value={values.name}
                onChange={(event) =>
                  setValues({ ...values, name: event.target.value })
                }
                placeholder="Productos generales"
              />
              <Button type="submit" className="h-10 w-fit">
                {submitLabel}
              </Button>
            </div>
          </Field>
        )}
        {isOption ? (
          <Button
            type="submit"
            className="w-fit sm:col-span-2 sm:justify-self-end"
          >
            {submitLabel}
          </Button>
        ) : null}
      </fieldset>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
