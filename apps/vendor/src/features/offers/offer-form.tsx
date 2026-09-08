"use client";

import { useActionState, useId, useState } from "react";
import type { ShippingProfileDTO } from "@medusajs/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { notifyFeedback } from "@/lib/feedback";
import type { MutationState } from "../workspace/presentation";
import { saveOfferAction } from "./actions";
import { shippingProfileName } from "../shipping/presentation";

export function OfferForm({
  variantId,
  warehouseId,
  profiles,
  offer,
  defaultSku,
}: {
  variantId: string;
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
  const [amount, setAmount] = useState(offer?.amount ?? "");
  const [sku, setSku] = useState(offer?.sku || defaultSku);
  const [stock, setStock] = useState("0");
  const [shippingProfileId, setShippingProfileId] = useState(
    offer?.shippingProfileId ?? (profiles.length === 1 ? profiles[0].id : ""),
  );
  const [savedValues, setSavedValues] = useState({
    amount: offer?.amount ?? "",
    sku: offer?.sku ?? defaultSku,
    shippingProfileId: offer?.shippingProfileId ?? "",
  });
  const [state, action, isPending] = useActionState(
    async (previous: MutationState, form: FormData) => {
      const result = await saveOfferAction(previous, form);
      if (result.status === "success") {
        setSavedValues({
          amount: String(Number(form.get("amount"))),
          sku: String(form.get("offer_sku") ?? "").trim(),
          shippingProfileId: String(form.get("shipping_profile_id") ?? ""),
        });
      }
      notifyFeedback(result);
      return result;
    },
    { status: "idle" },
  );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="variant_id" value={variantId} />
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
      <fieldset disabled={isPending} className="grid gap-4 sm:grid-cols-2">
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
            onChange={(event) => setAmount(event.target.value)}
          />
          <FieldDescription>Antes de impuestos.</FieldDescription>
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
              <FieldDescription>
                Se registran en el único almacén de tu tienda.
              </FieldDescription>
            </Field>
          </>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${prefix}-profile`}>
            Perfil de envío *
          </FieldLabel>
          <select
            id={`${prefix}-profile`}
            name="shipping_profile_id"
            required
            value={shippingProfileId}
            onChange={(event) => setShippingProfileId(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="" disabled>
              Seleccionar perfil
            </option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {shippingProfileName(profile)}
              </option>
            ))}
          </select>
        </Field>
        <details className="sm:col-span-2">
          <summary className="w-fit cursor-pointer text-sm text-primary underline underline-offset-4">
            Opciones avanzadas
          </summary>
          <Field className="mt-4 max-w-lg">
            <FieldLabel htmlFor={`${prefix}-sku`}>
              Código interno (SKU)
            </FieldLabel>
            <Input
              id={`${prefix}-sku`}
              name="offer_sku"
              required
              maxLength={100}
              value={sku}
              onChange={(event) => setSku(event.target.value)}
            />
            <FieldDescription>
              Ya está completado. Cámbialo solo si usas tus propios códigos de
              inventario.
            </FieldDescription>
          </Field>
        </details>
        <Button type="submit" className="w-fit sm:col-span-2">
          {isPending
            ? "Guardando…"
            : offer
              ? "Guardar cambios"
              : "Guardar precio y existencias"}
        </Button>
      </fieldset>
      {state.message ? (
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
