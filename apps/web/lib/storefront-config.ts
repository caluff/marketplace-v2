export const STOREFRONT_ENV = {
  backendUrl: "NEXT_PUBLIC_MEDUSA_BACKEND_URL",
  publishableKey: "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY",
} as const

export type StorefrontEnvironment = Partial<
  Record<(typeof STOREFRONT_ENV)[keyof typeof STOREFRONT_ENV], string>
>

export type StorefrontConfigResult =
  | {
      status: "valid"
      config: {
        baseUrl: string
        publishableKey: string
      }
    }
  | {
      status: "missing"
      missing: Array<"backend_url" | "publishable_key">
    }
  | { status: "invalid_backend_url" }
  | { status: "invalid_publishable_key" }

// Medusa 2.18 generates publishable keys as `pk_` plus 32 random bytes in hex.
const PUBLISHABLE_KEY_PATTERN = /^pk_[0-9a-f]{64}$/

function normalizeBackendUrl(value: string): string | null {
  try {
    const url = new URL(value)

    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null
    }

    const pathname = url.pathname.replace(/\/+$/, "")
    return `${url.origin}${pathname}`
  } catch {
    return null
  }
}

export function validateStorefrontEnvironment(
  environment: StorefrontEnvironment,
): StorefrontConfigResult {
  const backendUrl = environment[STOREFRONT_ENV.backendUrl]?.trim()
  const publishableKey = environment[STOREFRONT_ENV.publishableKey]?.trim()
  const missing: Array<"backend_url" | "publishable_key"> = []

  if (!backendUrl) {
    missing.push("backend_url")
  }

  if (!publishableKey) {
    missing.push("publishable_key")
  }

  if (missing.length > 0) {
    return { status: "missing", missing }
  }

  // The missing-fields branch above guarantees both values are present. This
  // explicit guard also keeps that invariant visible to TypeScript.
  if (!backendUrl || !publishableKey) {
    return { status: "missing", missing }
  }

  const normalizedBackendUrl = normalizeBackendUrl(backendUrl)

  if (!normalizedBackendUrl) {
    return { status: "invalid_backend_url" }
  }

  if (!PUBLISHABLE_KEY_PATTERN.test(publishableKey)) {
    return { status: "invalid_publishable_key" }
  }

  return {
    status: "valid",
    config: {
      baseUrl: normalizedBackendUrl,
      publishableKey,
    },
  }
}
