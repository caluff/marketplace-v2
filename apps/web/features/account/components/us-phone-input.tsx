"use client"

import { useEffect, useRef, useState } from "react"
import PhoneInput, {
  isValidPhoneNumber,
  parsePhoneNumber,
} from "react-phone-number-input/input"

import { FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function UsPhoneInput({
  id,
  name = "phone",
  value,
  onChange,
  required = false,
  disabled = false,
  error,
  describedBy,
}: {
  id: string
  name?: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  error?: string
  describedBy?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [hasBlurred, setHasBlurred] = useState(false)
  const validationError =
    !value && required
      ? "Ingresa un teléfono de contacto para esta dirección."
      : value &&
          (!isValidPhoneNumber(value) ||
            parsePhoneNumber(value)?.country !== "US")
        ? "Ingresa un teléfono válido de Estados Unidos (+1). No se admiten números de otros países."
        : undefined
  const message = error || (hasBlurred ? validationError : undefined)

  useEffect(() => {
    inputRef.current?.setCustomValidity(validationError ?? "")
  }, [validationError])

  return (
    <>
      <input type="hidden" name={name} value={value} disabled={disabled} />
      <PhoneInput
        ref={inputRef}
        inputComponent={Input}
        id={id}
        country="US"
        international
        withCountryCallingCode
        value={value || undefined}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        onBlur={() => setHasBlurred(true)}
        onInvalid={() => setHasBlurred(true)}
        autoComplete="tel"
        inputMode="tel"
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(message)}
        aria-describedby={
          [describedBy, message ? `${id}-error` : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      <FieldError id={`${id}-error`}>{message}</FieldError>
    </>
  )
}
