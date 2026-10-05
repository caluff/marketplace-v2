"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { ShippingProfileDTO } from "@medusajs/types";
import type { ProductDTO, ProductVariantDTO } from "@mercurjs/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { notifyFeedback } from "@/lib/feedback";
import { savePresentationAction } from "./actions";
import type { PresentationSaveState } from "./save-presentation";
import {
  hasPresentationOptions,
  hasVariantCombination,
  variantOptionValues,
} from "../catalog/variant-options";
import { usePresentationEditor } from "../catalog/presentation-editor";
import { useUnsavedChanges } from "../workspace/unsaved-changes";
import {
  isShippingProfileArchived,
  shippingProfileName,
} from "../shipping/presentation";

export function OfferForm({
  variantId,
  product,
  variant,
  hasPending,
  masterSku,
  warehouseId,
  profiles,
  offer,
  defaultSku,
}: {
  variantId: string;
  product: ProductDTO;
  variant: ProductVariantDTO;
  hasPending: boolean;
  masterSku: string;
  warehouseId: string;
  profiles: ShippingProfileDTO[];
  offer?: {
    id: string;
    sku: string;
    amount: string;
    shippingProfileId: string;
  };
  defaultSku: string;
}) {
  const prefix = useId();
  const editor = usePresentationEditor();
  const hasOptions = hasPresentationOptions(product);
  const [title, setTitle] = useState(variant.title);
  const [selectedOptions, setSelectedOptions] = useState(() =>
    variantOptionValues(product, variant),
  );
  const [savedVariant, setSavedVariant] = useState({
    title: variant.title,
    options: variantOptionValues(product, variant),
  });
  const hasDuplicate = hasVariantCombination(
    product,
    selectedOptions,
    variant.id,
  );
  const changeVariant =
    hasOptions &&
    !hasPending &&
    (title.trim() !== savedVariant.title ||
      JSON.stringify(selectedOptions) !== JSON.stringify(savedVariant.options));
  const [amount, setAmount] = useState(offer?.amount ?? "");
  const [sku] = useState(offer?.sku || defaultSku);
  const [stock, setStock] = useState("0");
  const activeProfiles = profiles.filter(
    (profile) => !isShippingProfileArchived(profile),
  );
  const [shippingProfileId, setShippingProfileId] = useState(
    offer?.shippingProfileId ??
      (activeProfiles.length === 1 ? activeProfiles[0].id : ""),
  );
  const [savedValues, setSavedValues] = useState({
    amount: offer?.amount ?? "",
    sku: offer?.sku ?? defaultSku,
    shippingProfileId: offer?.shippingProfileId ?? "",
  });
  const formRef = useRef<HTMLFormElement>(null);
  const draft = {
    title: title.trim(),
    options: selectedOptions,
    amount: amount === "" ? "" : String(Number(amount)),
    stock: String(Number(stock)),
    shippingProfileId,
  };
  const [savedDraft, setSavedDraft] = useState(draft);
  const unsaved = useUnsavedChanges(
    JSON.stringify(draft) !== JSON.stringify(savedDraft),
    formRef,
  );
  const [state, action, isPending] = useActionState(
    async (previous: PresentationSaveState, form: FormData) => {
      try {
        const result = await savePresentationAction(previous, form);
        if (result.savedVariant) {
          setSavedVariant({
            title: title.trim(),
            options: [...selectedOptions],
          });
          setSavedDraft((previousDraft) => ({
            ...previousDraft,
            title: draft.title,
            options: [...draft.options],
          }));
        }
        if (result.savedOffer) {
          setSavedValues({
            amount: String(Number(form.get("amount"))),
            sku: String(form.get("offer_sku") ?? "").trim(),
            shippingProfileId: String(form.get("shipping_profile_id") ?? ""),
          });
          setSavedDraft((previousDraft) => ({
            ...previousDraft,
            amount: draft.amount,
            stock: draft.stock,
            shippingProfileId: draft.shippingProfileId,
          }));
        }
        notifyFeedback(result);
        if (result.status === "success") {
          unsaved.markSaved();
          editor?.close();
        }
        return result;
      } finally {
        editor?.setBusy(false);
      }
    },
    { status: "idle" },
  );
  const changeOffer =
    !offer ||
    Number(amount) !== Number(savedValues.amount) ||
    shippingProfileId !== savedValues.shippingProfileId;
  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={() => editor?.setBusy(true)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isPending && editor) {
          event.preventDefault();
          event.stopPropagation();
          unsaved.confirmDiscard(editor.close);
        }
      }}
      className="space-y-3"
      aria-busy={isPending}
    >
      <input type="hidden" name="variant_id" value={variantId} />
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="master_sku" value={masterSku} />
      <input
        type="hidden"
        name="change_variant"
        value={String(changeVariant)}
      />
      <input type="hidden" name="change_offer" value={String(changeOffer)} />
      <input type="hidden" name="offer_sku" value={sku} />
      <input type="hidden" name="location_id" value={warehouseId} />
      {offer ? (
        <>
          <input type="hidden" name="offer_id" value={offer.id} />
          <input
            type="hidden"
            name="expected_amount"
            value={savedValues.amount}
          />
          <input type="hidden" name="expected_sku" value={savedValues.sku} />
          <input
            type="hidden"
            name="expected_shipping_profile_id"
            value={savedValues.shippingProfileId}
          />
        </>
      ) : null}
      <fieldset
        disabled={isPending}
        className={`grid items-start gap-4 ${offer ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}
      >
        {hasOptions ? (
          <fieldset
            disabled={hasPending}
            className="grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:col-span-full"
          >
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={`${prefix}-title`}>
                Nombre de la presentación
              </FieldLabel>
              <Input
                id={`${prefix}-title`}
                name="title"
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            {(product.options ?? []).map((option, index) =>
              option.title === "__default__" ? (
                <input
                  key={option.id}
                  type="hidden"
                  name={`option_${index}`}
                  value={selectedOptions[index] ?? ""}
                />
              ) : (
                <Field key={option.id}>
                  <FieldLabel htmlFor={`${prefix}-option-${index}`}>
                    {option.title}
                  </FieldLabel>
                  <NativeSelect
                    id={`${prefix}-option-${index}`}
                    name={`option_${index}`}
                    required
                    value={selectedOptions[index] ?? ""}
                    aria-describedby={
                      hasDuplicate ? `${prefix}-duplicate` : undefined
                    }
                    onChange={(event) =>
                      setSelectedOptions((current) =>
                        current.map((value, at) =>
                          at === index ? event.target.value : value,
                        ),
                      )
                    }
                  >
                    <option value="" disabled>
                      Seleccionar valor
                    </option>
                    {option.values?.map((value) => (
                      <option key={value.id} value={value.value}>
                        {value.value}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ),
            )}
          </fieldset>
        ) : (
          <input type="hidden" name="title" value={title} />
        )}
        {hasDuplicate ? (
          <p
            id={`${prefix}-duplicate`}
            role="status"
            className="text-sm text-muted-foreground col-span-full"
          >
            Esta combinación ya tiene una presentación. Elige otros valores.
          </p>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${prefix}-amount`}>
            Precio de venta (USD) *
          </FieldLabel>
          <Input
            id={`${prefix}-amount`}
            name="amount"
            type="number"
            required
            min={0}
            max={999999999.99}
            step="0.01"
            value={amount}
            aria-describedby={`${prefix}-amount-help`}
            onChange={(event) => setAmount(event.target.value)}
          />
          <FieldDescription id={`${prefix}-amount-help`}>
            Antes de impuestos.
          </FieldDescription>
        </Field>
        {!offer ? (
          <>
            <Field>
              <FieldLabel htmlFor={`${prefix}-stock`}>
                Existencias iniciales *
              </FieldLabel>
              <Input
                id={`${prefix}-stock`}
                name="stocked_quantity"
                required
                type="number"
                min={0}
                step={1}
                value={stock}
                onChange={(event) => setStock(event.target.value)}
              />
            </Field>
          </>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${prefix}-profile`}>
            Perfil de envío *
          </FieldLabel>
          <NativeSelect
            id={`${prefix}-profile`}
            name="shipping_profile_id"
            required
            value={shippingProfileId}
            onChange={(event) => setShippingProfileId(event.target.value)}
          >
            <option value="" disabled>
              Seleccionar perfil
            </option>
            {profiles
              .filter(
                (profile) =>
                  !isShippingProfileArchived(profile) ||
                  profile.id === offer?.shippingProfileId,
              )
              .map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {shippingProfileName(profile)}
                  {isShippingProfileArchived(profile) ? " (archivado)" : ""}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <div
          className={`flex flex-wrap gap-2 ${offer ? "sm:col-span-2" : "sm:col-span-2 lg:col-span-3"}`}
        >
          <Button
            type="submit"
            disabled={hasDuplicate || (!changeVariant && !changeOffer)}
          >
            {isPending ? "Guardando…" : "Guardar"}
          </Button>
          {editor ? (
            <Button
              variant="ghost"
              onClick={() => unsaved.confirmDiscard(editor.close)}
            >
              Cancelar
            </Button>
          ) : null}
        </div>
      </fieldset>
      {state.status === "error" && state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className="rounded-lg border p-3 text-sm"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
