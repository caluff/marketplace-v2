"use client";

import { useActionState, useId } from "react";
import type { ProductDTO, ProductVariantDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { editVariantAction } from "./actions";

function nextVariantOptions(product: ProductDTO) {
  const options = product.options ?? [];
  const used = new Set(
    (product.variants ?? []).map((current) =>
      JSON.stringify(
        options.map(
          (option) =>
            current.options?.find(
              (value) => value.option?.title === option.title,
            )?.value ?? "",
        ),
      ),
    ),
  );
  const selected: string[] = [];

  function find(index: number): string[] | null {
    if (index === options.length) {
      return used.has(JSON.stringify(selected)) ? null : [...selected];
    }
    for (const value of options[index].values ?? []) {
      selected.push(value.value);
      const match = find(index + 1);
      selected.pop();
      if (match) return match;
    }
    return null;
  }

  return find(0);
}

export function VariantForm({
  product,
  variant,
  defaultSku,
}: {
  product: ProductDTO;
  variant?: ProductVariantDTO;
  defaultSku?: string;
}) {
  const prefix = useId();
  const automaticOptions = variant ? null : nextVariantOptions(product);
  const automaticTitle = (
    automaticOptions?.filter((value) => value !== "__default__").join(" / ") ||
    "Única"
  ).slice(0, 200);
  const [state, action, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      const result = await editVariantAction(previous, form);
      notifyFeedback(result);
      return result;
    },
    { status: "idle" },
  );
  if (!variant && !automaticOptions)
    return (
      <p className="text-sm text-muted-foreground">
        Ya están creadas todas las combinaciones disponibles. Para añadir otras,
        solicita primero nuevos tamaños, colores u opciones.
      </p>
    );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="variant_id" value={variant?.id ?? ""} />
      <fieldset
        disabled={isPending || state.status === "success"}
        className="grid gap-4 sm:grid-cols-2"
      >
        {variant ? (
          <>
            <Field>
              <FieldLabel htmlFor={`${prefix}-title`}>
                Nombre de la presentación
              </FieldLabel>
              <Input
                id={`${prefix}-title`}
                name="title"
                required
                maxLength={200}
                defaultValue={variant.title}
              />
            </Field>
            <details className="sm:col-span-2">
              <summary className="w-fit cursor-pointer text-sm text-primary underline underline-offset-4">
                Código de catálogo
              </summary>
              <Field className="mt-4 max-w-lg">
                <FieldLabel htmlFor={`${prefix}-sku`}>
                  Código interno (SKU)
                </FieldLabel>
                <Input
                  id={`${prefix}-sku`}
                  name="master_sku"
                  required
                  maxLength={100}
                  defaultValue={variant.sku || defaultSku}
                />
              </Field>
            </details>
          </>
        ) : (
          <>
            <input type="hidden" name="title" value={automaticTitle} />
            <Field>
              <FieldLabel>Nombre de la presentación</FieldLabel>
              <p className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                {automaticTitle}
              </p>
            </Field>
          </>
        )}
        {(product.options ?? []).map((option, index) => (
          <Field key={option.id}>
            <FieldLabel
              htmlFor={variant ? `${prefix}-option-${index}` : undefined}
            >
              {option.title === "__default__" ? "Presentación" : option.title}
            </FieldLabel>
            {variant ? (
              <select
                id={`${prefix}-option-${index}`}
                name={`option_${index}`}
                required
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={
                  variant.options?.find(
                    (value) => value.option?.title === option.title,
                  )?.value ?? ""
                }
              >
                <option value="" disabled>
                  Seleccionar valor
                </option>
                {option.values?.map((value) => (
                  <option key={value.id} value={value.value}>
                    {value.value === "__default__" ? "Única" : value.value}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="hidden"
                  name={`option_${index}`}
                  value={automaticOptions?.[index] ?? ""}
                />
                <p className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                  {automaticOptions?.[index] === "__default__"
                    ? "Única"
                    : automaticOptions?.[index]}
                </p>
              </>
            )}
          </Field>
        ))}
        <Button className="w-fit sm:col-span-2" type="submit">
          {isPending ? "Enviando…" : "Enviar a revisión"}
        </Button>
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
  );
}
