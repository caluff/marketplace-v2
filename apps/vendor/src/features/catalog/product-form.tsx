"use client";

import { useActionState, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProductDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { useFormUnsavedChanges } from "../workspace/unsaved-changes";
import {
  variantCombinations,
  type CatalogAxis,
  type CatalogVariant,
} from "./validation";
import { ProductImages, type ProductImagesHandle } from "./product-images";
import { PRODUCT_MEASUREMENTS } from "./product-specifications";

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
  const router = useRouter();
  const imagePicker = useRef<ProductImagesHandle>(null);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [axes, setAxes] = useState<{ title: string; values: string }[]>([]);
  const [variants, setVariants] = useState<CatalogVariant[]>([
    { title: "Variante única", sku: "", options: {} },
  ]);
  const [axisError, setAxisError] = useState("");
  const [generatedAxes, setGeneratedAxes] = useState<CatalogAxis[]>([]);
  const [imageIds, setImageIds] = useState(() =>
    (product?.images ?? []).map((image) => image.id),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const unsaved = useFormUnsavedChanges(
    formRef,
    JSON.stringify({ axes, variants, imageIds }),
  );
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
        if (result.status === "success") unsaved.markSaved();
        if (!product && result.status === "success" && result.href) {
          router.replace(result.href);
        }
        return result;
      } catch (error) {
        const result: MutationState = {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "No se pudo guardar el producto. Inténtalo nuevamente.",
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
  function removeAxis(index: number) {
    const remaining = axes.filter((_, at) => at !== index);
    setAxes(remaining);
    setAxisError("");
    if (remaining.length === 0) {
      setGeneratedAxes([]);
      setVariants([{ title: "Variante única", sku: "", options: {} }]);
    }
  }
  return (
    <form
      ref={formRef}
      action={formAction}
      onChangeCapture={unsaved.onChange}
      onInvalidCapture={(event) => {
        if (event.target instanceof HTMLElement) {
          const section = event.target.closest("details");
          if (section) section.open = true;
        }
      }}
      onSubmit={(event) => {
        if (isPending || isUploadingImages || hasUngeneratedChanges)
          event.preventDefault();
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
            <FieldLabel htmlFor={`${prefix}-subtitle`}>
              Resumen breve
            </FieldLabel>
            <Input
              id={`${prefix}-subtitle`}
              name="subtitle"
              aria-describedby={`${prefix}-subtitle-help`}
              maxLength={200}
              defaultValue={product?.subtitle ?? ""}
            />
            <FieldDescription id={`${prefix}-subtitle-help`}>
              Se muestra junto al nombre del producto. Hasta 200 caracteres.
            </FieldDescription>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={`${prefix}-description`}>
              Descripción detallada
            </FieldLabel>
            <Textarea
              id={`${prefix}-description`}
              name="description"
              aria-describedby={`${prefix}-description-help`}
              rows={5}
              maxLength={10000}
              defaultValue={product?.description ?? ""}
            />
            <FieldDescription id={`${prefix}-description-help`}>
              Describe sus características, uso y contenido. Separa las ideas en
              párrafos; se conservarán los saltos de línea. Hasta 10.000
              caracteres.
            </FieldDescription>
          </Field>
        </div>
        <details className="space-y-4 border-t pt-5">
          <summary className="w-fit cursor-pointer text-sm font-semibold focus-visible:outline-2">
            Ficha técnica (opcional)
          </summary>
          <FieldDescription>
            Opcionales. Completa solo los datos que conozcas: aparecerán en la
            ficha técnica.
          </FieldDescription>
          <Field>
            <FieldLabel htmlFor={`${prefix}-material`}>Material</FieldLabel>
            <Input
              id={`${prefix}-material`}
              name="material"
              maxLength={200}
              defaultValue={product?.material ?? ""}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCT_MEASUREMENTS.map(({ name, label }) => (
              <Field key={name}>
                <FieldLabel htmlFor={`${prefix}-${name}`}>{label}</FieldLabel>
                <Input
                  id={`${prefix}-${name}`}
                  name={name}
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  step="any"
                  defaultValue={product?.[name] ?? ""}
                />
              </Field>
            ))}
          </div>
        </details>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">
            Categorías del catálogo
          </legend>
          {categories}
          <p className="text-xs text-muted-foreground">
            Si falta una categoría, solicita su incorporación al operador.
          </p>
        </fieldset>
        {!product ? (
          <details className="space-y-4 border-t pt-5">
            <summary className="w-fit cursor-pointer text-sm font-semibold focus-visible:outline-2">
              Tallas, colores u otras opciones (opcional)
            </summary>
            <FieldDescription>
              Añade opciones solo si el producto tiene distintas presentaciones.
            </FieldDescription>
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
                    placeholder="Por ejemplo, Talla"
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
                    Valores
                  </FieldLabel>
                  <Input
                    id={`${prefix}-values-${index}`}
                    aria-describedby={`${prefix}-values-help-${index}`}
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
                <FieldDescription
                  id={`${prefix}-values-help-${index}`}
                  className="sm:col-start-2 sm:row-start-2"
                >
                  Separa cada valor con una coma.
                </FieldDescription>
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-self-start sm:col-start-3 sm:row-start-1 sm:self-end"
                  onClick={() => removeAxis(index)}
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
              {axes.length > 0 ? (
                <Button type="button" variant="secondary" onClick={generate}>
                  {generatedAxes.length > 0
                    ? "Actualizar presentaciones"
                    : "Crear presentaciones"}
                </Button>
              ) : null}
            </div>
            {axisError ? (
              <p role="alert" className="text-sm text-destructive">
                {axisError}
              </p>
            ) : null}
            {generatedAxes.length > 0 && !hasUngeneratedChanges ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">
                  Nombres de las presentaciones
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {variants.map((variant, index) => (
                    <Field key={JSON.stringify(variant.options)}>
                      <FieldLabel htmlFor={`${prefix}-variant-${index}`}>
                        {Object.values(variant.options).join(" / ")}
                      </FieldLabel>
                      <Input
                        id={`${prefix}-variant-${index}`}
                        aria-label={`Nombre de presentación ${index + 1}`}
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
                  ))}
                </div>
              </div>
            ) : null}
          </details>
        ) : null}
        <ProductImages
          ref={imagePicker}
          initialImages={product?.images}
          disabled={disabled || isPending || state.status === "success"}
          onBusyChange={setIsUploadingImages}
          onImagesChange={setImageIds}
        />
        {hasUngeneratedChanges ? (
          <p role="status" className="text-sm text-muted-foreground">
            {generatedAxes.length > 0
              ? "Actualiza las presentaciones en la sección de opciones antes de guardar."
              : "Crea las presentaciones en la sección de opciones antes de guardar."}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={hasUngeneratedChanges || isUploadingImages}
        >
          {isPending
            ? "Guardando…"
            : product
              ? "Guardar datos del producto"
              : "Guardar producto"}
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
