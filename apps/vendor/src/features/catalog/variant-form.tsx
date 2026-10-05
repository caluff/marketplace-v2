"use client";

import { useActionState, useId, useState } from "react";
import type { ProductDTO, ProductVariantDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { editVariantAction } from "./actions";
import { usePresentationEditor } from "./presentation-editor";
import {
  hasPresentationOptions,
  hasVariantCombination,
  nextVariantOptions,
  variantOptionValues,
} from "./variant-options";

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
  const editor = usePresentationEditor();
  const hasOptions = hasPresentationOptions(product);
  const [selectedOptions, setSelectedOptions] = useState(() =>
    variant
      ? variantOptionValues(product, variant)
      : nextVariantOptions(product),
  );
  const automaticTitle = (
    selectedOptions?.filter((value) => value !== "__default__").join(" / ") ||
    "Única"
  ).slice(0, 200);
  const hasDuplicate =
    selectedOptions !== null &&
    hasVariantCombination(product, selectedOptions, variant?.id);
  const [state, action, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      try {
        const result = await editVariantAction(previous, form);
        notifyFeedback(result);
        if (result.status === "success") editor?.close();
        return result;
      } finally {
        editor?.setBusy(false);
      }
    },
    { status: "idle" },
  );
  if (!variant && !selectedOptions)
    return (
      <p className="text-sm text-muted-foreground">
        Ya están creadas todas las combinaciones disponibles. Para añadir otras,
        añade primero nuevos tamaños, colores u opciones.
      </p>
    );
  return (
    <form
      action={action}
      onSubmit={() => editor?.setBusy(true)}
      className="space-y-4"
    >
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="variant_id" value={variant?.id ?? ""} />
      {variant ? (
        <input
          type="hidden"
          name="master_sku"
          value={variant.sku || defaultSku || ""}
        />
      ) : null}
      <fieldset
        disabled={isPending || state.status === "success"}
        className="grid gap-4 sm:grid-cols-2"
      >
        {variant && hasOptions ? (
          <Field className="sm:col-span-2">
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
        ) : (
          <input
            type="hidden"
            name="title"
            value={variant?.title || automaticTitle}
          />
        )}
        {(product.options ?? []).map((option, index) => {
          const value = selectedOptions?.[index] ?? "";
          if (option.title === "__default__") {
            return (
              <input
                key={option.id}
                type="hidden"
                name={`option_${index}`}
                value={value}
              />
            );
          }
          return (
            <Field key={option.id}>
              <FieldLabel htmlFor={`${prefix}-option-${index}`}>
                {option.title}
              </FieldLabel>
              <NativeSelect
                id={`${prefix}-option-${index}`}
                name={`option_${index}`}
                required
                value={value}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedOptions((current) =>
                    (current ?? []).map((entry, optionIndex) =>
                      optionIndex === index ? value : entry,
                    ),
                  );
                }}
                aria-describedby={
                  hasDuplicate ? `${prefix}-duplicate` : undefined
                }
              >
                <option value="" disabled>
                  Seleccionar valor
                </option>
                {option.values?.map((entry) => (
                  <option key={entry.id} value={entry.value}>
                    {entry.value === "__default__" ? "Única" : entry.value}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          );
        })}
        {hasDuplicate ? (
          <p
            id={`${prefix}-duplicate`}
            role="status"
            className="text-sm text-muted-foreground sm:col-span-2"
          >
            Esta combinación ya tiene una presentación. Elige otros valores.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={hasDuplicate}>
            {isPending
              ? "Guardando…"
              : variant
                ? "Guardar"
                : "Crear presentación"}
          </Button>
          {editor ? (
            <Button variant="ghost" onClick={editor.close}>
              Cancelar
            </Button>
          ) : null}
        </div>
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
