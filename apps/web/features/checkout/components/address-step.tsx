"use client"

import type { HttpTypes } from "@medusajs/types"
import { useRouter } from "next/navigation"
import { useActionState, useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { UsPhoneInput } from "@/features/account/components/us-phone-input"
import { US_STATES } from "@/features/account/us-states"
import {
  saveAddressAction,
  type CartActionState,
} from "@/features/cart/actions"

export function AddressStep({ cart }: { cart: HttpTypes.StoreCart }) {
  const id = useId()
  const router = useRouter()
  const address = cart.shipping_address
  const [values, setValues] = useState<Record<string, string>>({
    email: cart.email ?? "",
    first_name: address?.first_name ?? "",
    last_name: address?.last_name ?? "",
    address_1: address?.address_1 ?? "",
    address_2: address?.address_2 ?? "",
    city: address?.city ?? "",
    province: address?.province?.toLowerCase() ?? "",
    postal_code: address?.postal_code ?? "",
    phone: address?.phone ?? "",
  })
  const [state, action, pending] = useActionState(
    async (previous: CartActionState, formData: FormData) => {
      try {
        const result = await saveAddressAction(previous, formData)
        if (!result.error) {
          router.replace("/checkout?step=shipping")
          router.refresh()
        }
        return result
      } catch {
        return {
          error: "No pudimos guardar la dirección. Inténtalo nuevamente.",
        }
      }
    },
    {},
  )

  const fields = [
    {
      name: "email",
      label: "Correo electrónico",
      autoComplete: "email",
      type: "email",
      wide: true,
    },
    {
      name: "first_name",
      label: "Nombre",
      autoComplete: "shipping given-name",
    },
    {
      name: "last_name",
      label: "Apellido",
      autoComplete: "shipping family-name",
    },
    {
      name: "address_1",
      label: "Dirección",
      autoComplete: "shipping address-line1",
      wide: true,
    },
    {
      name: "address_2",
      label: "Apartamento, suite, etc. (opcional)",
      autoComplete: "shipping address-line2",
      wide: true,
    },
    { name: "city", label: "Ciudad", autoComplete: "shipping address-level2" },
    {
      name: "postal_code",
      label: "Código postal",
      autoComplete: "shipping postal-code",
    },
  ]

  return (
    <form action={action} className="space-y-6" aria-busy={pending}>
      <h2 className="text-2xl font-medium tracking-tight">
        Contacto y dirección
      </h2>
      <input type="hidden" name="country_code" value="us" />
      <fieldset
        disabled={pending}
        className="grid min-w-0 gap-5 sm:grid-cols-2"
      >
        <legend className="sr-only">
          Dirección de envío en Estados Unidos
        </legend>
        {fields.map((field) => (
          <Field
            key={field.name}
            className={field.wide ? "sm:col-span-2" : undefined}
          >
            <FieldLabel htmlFor={`${id}-${field.name}`}>
              {field.label}
            </FieldLabel>
            <Input
              id={`${id}-${field.name}`}
              name={field.name}
              type={field.type ?? "text"}
              value={values[field.name]}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field.name]: event.target.value,
                }))
              }
              autoComplete={field.autoComplete}
              required={field.name !== "address_2"}
              maxLength={field.name === "postal_code" ? 10 : 200}
              pattern={
                field.name === "postal_code"
                  ? "[0-9]{5}(-[0-9]{4})?"
                  : undefined
              }
              title={
                field.name === "postal_code"
                  ? "Usa 5 dígitos o ZIP+4: 12345-6789."
                  : undefined
              }
              className="min-h-12"
            />
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor={`${id}-province`}>Estado</FieldLabel>
          <NativeSelect
            id={`${id}-province`}
            name="province"
            value={values.province}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                province: event.target.value,
              }))
            }
            required
            autoComplete="shipping address-level1"
          >
            <NativeSelectOption value="" disabled>
              Selecciona un estado
            </NativeSelectOption>
            {US_STATES.map((state) => (
              <NativeSelectOption key={state.value} value={state.value}>
                {state.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-country`}>País</FieldLabel>
          <Input
            id={`${id}-country`}
            value="Estados Unidos"
            readOnly
            className="min-h-12 bg-muted/40"
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`${id}-phone`}>Teléfono de contacto</FieldLabel>
          <UsPhoneInput
            id={`${id}-phone`}
            value={values.phone}
            onChange={(phone) =>
              setValues((current) => ({ ...current, phone }))
            }
            required
            disabled={pending}
          />
        </Field>
      </fieldset>
      <p className="text-sm text-muted-foreground">
        Usaremos esta misma dirección para la facturación.
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="w-full sm:w-auto"
      >
        {pending ? "Guardando…" : "Continuar al envío"}
      </Button>
    </form>
  )
}
