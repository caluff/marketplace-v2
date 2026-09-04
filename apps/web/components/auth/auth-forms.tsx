"use client"

import { Eye, EyeOff, LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useActionState, useState } from "react"

import {
  confirmCustomerEmailAction,
  forgotCustomerPasswordAction,
  loginCustomerAction,
  registerCustomerAction,
  resendCustomerVerificationAction,
  resetCustomerPasswordAction,
  verifyCustomerMfaAction,
} from "@/app/auth-actions"
import { Button } from "@/components/ui/button"
import { INITIAL_AUTH_STATE, type AuthActionState } from "@/lib/auth-utils"

function FieldError({ message }: { message?: string }) {
  return message ? <p className="font-sans text-xs font-semibold text-accent">{message}</p> : null
}

function Status({ state }: { state: AuthActionState }) {
  if (!state.message) return <div aria-live="polite" className="sr-only" />
  return (
    <div
      aria-live="polite"
      className={state.status === "success" ? "border border-primary/25 bg-muted p-3 font-sans text-sm" : "border border-accent/40 bg-accent/8 p-3 font-sans text-sm"}
    >
      {state.message}
      {state.status === "external_redirect" && state.externalUrl ? (
        <a className="mt-3 flex min-h-11 items-center justify-center bg-primary px-4 font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/40" href={state.externalUrl}>Continuar con el proveedor</a>
      ) : null}
    </div>
  )
}

function TextField({
  id,
  name,
  label,
  type = "text",
  autoComplete,
  error,
}: {
  id: string
  name: string
  label: string
  type?: string
  autoComplete?: string
  error?: string
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-sans text-sm font-bold">{label}</label>
      <input id={id} name={name} type={type} autoComplete={autoComplete} required aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="min-h-11 w-full border border-border bg-background px-3 font-sans text-base outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/25" />
      <div id={`${id}-error`}><FieldError message={error} /></div>
    </div>
  )
}

function PasswordField({
  id,
  name,
  label,
  autoComplete,
  error,
}: {
  id: string
  name: string
  label: string
  autoComplete: string
  error?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block font-sans text-sm font-bold">{label}</label>
      <div className="relative">
        <input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className="min-h-11 w-full border border-border bg-background px-3 pr-12 font-sans text-base outline-none focus:border-ring focus:ring-3 focus:ring-ring/25" />
        <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute inset-y-0 right-0 grid min-w-11 place-items-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30">
          {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        </button>
      </div>
      <div id={`${id}-error`}><FieldError message={error} /></div>
    </div>
  )
}

function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return <Button type="submit" className="w-full" disabled={pending} aria-disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{pending ? "Procesando…" : children}</Button>
}

export function CustomerLoginForm({ next, expired }: { next: string; expired?: boolean }) {
  const [state, action, pending] = useActionState(loginCustomerAction, INITIAL_AUTH_STATE)
  const [mfaState, mfaAction, mfaPending] = useActionState(verifyCustomerMfaAction, INITIAL_AUTH_STATE)

  if (state.status === "mfa_required") {
    return (
      <form action={mfaAction} className="space-y-5" aria-label="Verificación de segundo factor">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="method" value={state.mfaMethods?.[0] ?? "totp"} />
        <TextField id="mfa-code" name="code" label="Código de verificación" autoComplete="one-time-code" error={mfaState.fieldErrors?.code} />
        <Status state={mfaState.message ? mfaState : state} />
        <SubmitButton pending={mfaPending}>Confirmar código</SubmitButton>
      </form>
    )
  }

  return (
    <form action={action} className="space-y-5" aria-label="Inicio de sesión de cliente">
      <input type="hidden" name="next" value={next} />
      {expired ? <p role="status" className="border border-accent/35 bg-accent/8 p-3 font-sans text-sm">Tu sesión venció. Inicia sesión nuevamente.</p> : null}
      <TextField id="login-email" name="email" label="Correo electrónico" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <div>
        <PasswordField id="login-password" name="password" label="Contraseña" autoComplete="current-password" error={state.fieldErrors?.password} />
        <Link href="/forgot-password" className="mt-2 inline-flex min-h-11 items-center font-sans text-xs font-bold text-muted-foreground underline underline-offset-4 hover:text-accent">¿Olvidaste tu contraseña?</Link>
      </div>
      <Status state={state} />
      <SubmitButton pending={pending}>Iniciar sesión</SubmitButton>
      <p className="text-center font-sans text-sm text-muted-foreground">¿Primera vez? <Link href="/register" className="inline-flex min-h-11 items-center font-bold text-foreground underline underline-offset-4 hover:text-accent">Crea tu cuenta</Link></p>
    </form>
  )
}

export function CustomerRegisterForm() {
  const [state, action, pending] = useActionState(registerCustomerAction, INITIAL_AUTH_STATE)
  return (
    <form action={action} className="space-y-5" aria-label="Registro de cliente">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="register-first-name" name="firstName" label="Nombre" autoComplete="given-name" error={state.fieldErrors?.firstName} />
        <TextField id="register-last-name" name="lastName" label="Apellido" autoComplete="family-name" error={state.fieldErrors?.lastName} />
      </div>
      <TextField id="register-email" name="email" label="Correo electrónico" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <PasswordField id="register-password" name="password" label="Contraseña" autoComplete="new-password" error={state.fieldErrors?.password} />
      <Status state={state} />
      <SubmitButton pending={pending}>Crear cuenta</SubmitButton>
      <p className="text-center font-sans text-sm text-muted-foreground">¿Ya tienes cuenta? <Link href="/login" className="inline-flex min-h-11 items-center font-bold text-foreground underline underline-offset-4 hover:text-accent">Inicia sesión</Link></p>
    </form>
  )
}

export function CustomerForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotCustomerPasswordAction, INITIAL_AUTH_STATE)
  return (
    <form action={action} className="space-y-5" aria-label="Recuperación de contraseña">
      <TextField id="forgot-email" name="email" label="Correo electrónico" type="email" autoComplete="email" error={state.fieldErrors?.email} />
      <Status state={state} />
      <SubmitButton pending={pending}>Enviar instrucciones</SubmitButton>
      <Link href="/login" className="flex min-h-11 items-center justify-center font-sans text-sm font-bold underline underline-offset-4">Volver al acceso</Link>
    </form>
  )
}

export function CustomerResetPasswordForm({ hasToken }: { hasToken: boolean }) {
  const [state, action, pending] = useActionState(resetCustomerPasswordAction, INITIAL_AUTH_STATE)
  return (
    <form action={action} className="space-y-5" aria-label="Restablecer contraseña">
      {!hasToken && state.status === "idle" ? <Status state={{ status: "error", message: "El enlace no es válido o ya venció. Solicita uno nuevo." }} /> : null}
      <PasswordField id="reset-password" name="password" label="Nueva contraseña" autoComplete="new-password" error={state.fieldErrors?.password} />
      <PasswordField id="reset-confirmation" name="confirmation" label="Repite la contraseña" autoComplete="new-password" />
      <Status state={state} />
      {state.status === "success" ? <Link href="/login" className="flex min-h-11 items-center justify-center bg-primary px-4 font-sans text-sm font-semibold text-primary-foreground">Ir al acceso</Link> : <SubmitButton pending={pending}>Guardar contraseña</SubmitButton>}
    </form>
  )
}

export function CustomerVerifyEmailForm({ hasCode, next }: { hasCode: boolean; next: string }) {
  const [state, action, pending] = useActionState(confirmCustomerEmailAction, INITIAL_AUTH_STATE)
  const [resendState, resendAction, resendPending] = useActionState(resendCustomerVerificationAction, INITIAL_AUTH_STATE)
  return (
    <div className="space-y-5">
      <form action={action} className="space-y-5" aria-label="Verificación de correo">
        {!hasCode ? <TextField id="verification-code" name="code" label="Código de verificación" autoComplete="one-time-code" error={state.fieldErrors?.code} /> : null}
        <Status state={state} />
        {state.status === "success" ? <Link href={`/login?next=${encodeURIComponent(next)}`} className="flex min-h-11 items-center justify-center bg-primary px-4 font-sans text-sm font-semibold text-primary-foreground">Iniciar sesión</Link> : <SubmitButton pending={pending}>Verificar correo</SubmitButton>}
      </form>
      {state.status !== "success" ? <form action={resendAction}><Button type="submit" variant="outline" className="w-full" disabled={resendPending}>{resendPending ? "Enviando…" : "Enviar otro código"}</Button><Status state={resendState} /></form> : null}
    </div>
  )
}
