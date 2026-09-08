"use client";

import { useActionState, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { ProductDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import {
  variantCombinations,
  type CatalogAxis,
  type CatalogVariant,
} from "./validation";
import { ProductImages, type ProductImagesHandle } from "./product-images";

export function ProductForm({
  action,
  categories,
  product,
  disabled = false,
}: {
  action: (previous: MutationState, form: FormData) => Promise<MutationState>;
  categories: ReactNode;
  product?: ProductDTO;
  disabled?: boolean;
}) {
  const prefix = useId();
  const imagePicker = useRef<ProductImagesHandle>(null);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [axes, setAxes] = useState<{ title: string; values: string }[]>([]);
  const [variants, setVariants] = useState<CatalogVariant[]>([
    { title: "Variante única", sku: "", options: {} },
  ]);
  const [axisError, setAxisError] = useState("");
  const [generatedAxes, setGeneratedAxes] = useState<CatalogAxis[]>([]);
  const hasUngeneratedChanges =
    JSON.stringify(
      axes.map((axis) => ({
        title: axis.title.trim(),
        values: axis.values
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      })),
    ) !== JSON.stringify(generatedAxes);
  const [state, formAction, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      try {
        if (!imagePicker.current)
          throw new Error("Espera a que carguen las imágenes.");
        form.set("images", JSON.stringify(await imagePicker.current.prepare()));
        const result = await action(previous, form);
        notifyFeedback(result);
        return result;
      } catch (error) {
        const result: MutationState = {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo enviar el producto. Inténtalo nuevamente.",
        };
        notifyFeedback(result);
        return result;
      }
    },
    { status: "idle" },
  );
  function generate() {
    try {
      const parsed = axes.map((axis) => ({
        title: axis.title.trim(),
        values: axis.values
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      }));
      const combinations = variantCombinations(parsed);
      setVariants(
        combinations.map((options) => {
          const existing = variants.find(
            (variant) =>
              JSON.stringify(variant.options) === JSON.stringify(options),
          );
          return (
            existing ?? {
              title: Object.values(options).join(" / ") || "Variante única",
              sku: "",
              options,
            }
          );
        }),
      );
      setGeneratedAxes(parsed);
      setAxisError("");
    } catch (error) {
      setAxisError(
        error instanceof Error ? error.message : "Revisa las opciones.",
      );
    }
  }
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (isPending || isUploadingImages || hasUngeneratedChanges) event.preventDefault();
      }}
      onReset={(event) => event.preventDefault()}
      className="space-y-6"
    >
      {product ? (
        <input type="hidden" name="id" value={product.id} />
      ) : (
        <>
          <input type="hidden" name="status" value="proposed" />
          <input
            type="hidden"
            name="axes"
            value={JSON.stringify(generatedAxes)}
          />
          <input
            type="hidden"
            name="variants"
            value={JSON.stringify(variants)}
          />
        </>
      )}
      <fieldset
        disabled={disabled || isPending || state.status === "success"}
        className="space-y-6"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${prefix}-title`}>Nombre *</FieldLabel>
            <Input
              id={`${prefix}-title`}
              name="title"
              required
              maxLength={200}
              defaultValue={product?.title}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-subtitle`}>Subtítulo</FieldLabel>
            <Input
              id={`${prefix}-subtitle`}
              name="subtitle"
              maxLength={200}
              defaultValue={product?.subtitle ?? ""}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={`${prefix}-description`}>
              Descripción
            </FieldLabel>
            <Textarea
              id={`${prefix}-description`}
              name="description"
              rows={5}
              maxLength={10000}
              defaultValue={product?.description ?? ""}
            />
          </Field>
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">
            Categorías del catálogo
          </legend>
          {categories}
          <p className="text-xs text-muted-foreground">
            Si falta una categoría, solicita su incorporación al operador. La
            selección se revisa junto con el producto.
          </p>
        </fieldset>
        {!product ? (
          <section className="space-y-4 border-t pt-5">
            <div>
              <h3 className="font-semibold">Opciones y variantes</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Define hasta tres opciones, como Talla o Color. Cada combinación
                tiene su propio SKU maestro, independiente del SKU de tu oferta.
              </p>
            </div>
            {axes.map((axis, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_2fr_auto]"
              >
                <Field>
                  <FieldLabel htmlFor={`${prefix}-axis-${index}`}>
                    Opción {index + 1}
                  </FieldLabel>
                  <Input
                    id={`${prefix}-axis-${index}`}
                    value={axis.title}
                    maxLength={100}
                    onChange={(event) =>
                      setAxes((current) =>
                        current.map((entry, at) =>
                          at === index
                            ? { ...entry, title: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-values-${index}`}>
                    Valores separados por comas
                  </FieldLabel>
                  <Input
                    id={`${prefix}-values-${index}`}
                    value={axis.values}
                    maxLength={3000}
                    placeholder="S, M, L"
                    onChange={(event) =>
                      setAxes((current) =>
                        current.map((entry, at) =>
                          at === index
                            ? { ...entry, values: event.target.value }
                            : entry,
                        ),
                      )
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  className="self-end"
                  onClick={() =>
                    setAxes((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                >
                  Quitar
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={axes.length >= 3}
                onClick={() =>
                  setAxes((current) => [...current, { title: "", values: "" }])
                }
              >
                Añadir opción
              </Button>
              <Button type="button" variant="secondary" onClick={generate}>
                Actualizar combinaciones
              </Button>
            </div>
            {axisError ? (
              <p role="alert" className="text-sm text-destructive">
                {axisError}
              </p>
            ) : null}
            <FieldDescription>
              Después de cambiar opciones o valores, actualiza las combinaciones
              antes de enviar.
            </FieldDescription>
            <div className="space-y-3">
              {variants.map((variant, index) => (
                <div
                  key={JSON.stringify(variant.options)}
                  className="grid gap-3 border-b pb-4 sm:grid-cols-2"
                >
                  <Field>
                    <FieldLabel htmlFor={`${prefix}-variant-${index}`}>
                      {Object.values(variant.options).join(" / ") ||
                        "Variante única"}
                    </FieldLabel>
                    <Input
                      id={`${prefix}-variant-${index}`}
                      aria-label={`Nombre de variante ${index + 1}`}
                      required
                      maxLength={200}
                      value={variant.title}
                      onChange={(event) =>
                        setVariants((current) =>
                          current.map((entry, at) =>
                            at === index
                              ? { ...entry, title: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>SKU maestro</FieldLabel>
                    <p className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                      Se generará automáticamente
                    </p>
                  </Field>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <ProductImages
          ref={imagePicker}
          initialImages={product?.images}
          disabled={disabled || isPending || state.status === "success"}
          onBusyChange={setIsUploadingImages}
        />
        {hasUngeneratedChanges ? (
          <p role="status" className="text-sm text-muted-foreground">
            Actualiza las combinaciones para incluir los cambios de opciones.
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={hasUngeneratedChanges || isUploadingImages}
        >
          {isPending ? "Enviando…" : "Enviar a revisión"}
        </Button>
      </fieldset>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className="rounded-lg border p-3 text-sm"
        >
          {state.message}{" "}
          {state.href ? (
            <Link href={state.href} className="font-medium underline">
              Ver producto
            </Link>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
