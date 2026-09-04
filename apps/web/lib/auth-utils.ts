export const WEB_SESSION_COOKIE = "mv2_web_customer_session"
export const WEB_MFA_COOKIE = "mv2_web_customer_mfa"
export const WEB_RESET_COOKIE = "mv2_web_customer_reset"
export const WEB_VERIFICATION_COOKIE = "mv2_web_customer_verification"
export const WEB_VERIFICATION_CODE_COOKIE =
  "mv2_web_customer_verification_code"

export type AuthFieldErrors = Partial<
  Record<"email" | "password" | "firstName" | "lastName" | "code", string>
>

export type AuthActionState = {
  status:
    | "idle"
    | "error"
    | "success"
    | "verification_required"
    | "mfa_required"
    | "external_redirect"
  message?: string
  fieldErrors?: AuthFieldErrors
  externalUrl?: string
  mfaMethods?: string[]
}

export const INITIAL_AUTH_STATE: AuthActionState = { status: "idle" }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmail(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function validateCredentials(email: string, password: string) {
  const fieldErrors: AuthFieldErrors = {}

  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    fieldErrors.email = "Ingresa un correo electrónico válido."
  }

  if (password.length < 8 || password.length > 256) {
    fieldErrors.password = "La contraseña debe tener entre 8 y 256 caracteres."
  }

  return fieldErrors
}

export function safeRedirectPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback: string,
): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  ) {
    return fallback
  }

  try {
    const base = new URL("https://marketplace.invalid")
    const candidate = new URL(value, base)

    const authenticationRoutes = [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
    ]

    if (
      candidate.origin !== base.origin ||
      authenticationRoutes.some(
        (route) =>
          candidate.pathname === route || candidate.pathname.startsWith(`${route}/`),
      )
    ) {
      return fallback
    }

    return `${candidate.pathname}${candidate.search}${candidate.hash}`
  } catch {
    return fallback
  }
}

export function safeExternalAuthUrl(value: string): string | null {
  try {
    const url = new URL(value)

    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

export function jwtMaxAge(token: string, fallbackSeconds = 60 * 60 * 24) {
  try {
    const encodedPayload = token.split(".")[1]
    if (!encodedPayload) return fallbackSeconds

    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as { exp?: unknown }
    if (typeof payload.exp !== "number") return fallbackSeconds

    return Math.max(60, Math.min(payload.exp - Math.floor(Date.now() / 1000), 60 * 60 * 24 * 7))
  } catch {
    return fallbackSeconds
  }
}

export function isJwtExpired(token: string): boolean {
  try {
    const encodedPayload = token.split(".")[1]
    if (!encodedPayload) return true
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as { exp?: unknown }
    return typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000
  } catch {
    return true
  }
}

export function packSecret(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

export function unpackSecret<T>(value: string | undefined): T | null {
  if (!value) return null

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T
  } catch {
    return null
  }
}
