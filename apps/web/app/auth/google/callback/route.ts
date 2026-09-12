import { createHash } from "node:crypto"
import type { AuthCallbackResponse } from "@medusajs/js-sdk"
import type { CompleteGoogleAuthResponse } from "@marketplace-v2/api/auth-contracts"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  createCustomerSdk,
  getCustomerSessionToken,
  setCustomerSession,
  setMfaSecret,
  setVerificationSecret,
} from "@/lib/auth-sdk"
import {
  GOOGLE_TRANSACTION_COOKIE,
  readGoogleTransaction,
  sameGoogleAuthIdentity,
  tokenHasCustomer,
} from "@/lib/google-auth"

async function resolveCustomerGoogleToken(
  token: string,
  existingToken?: string,
) {
  if (!existingToken && tokenHasCustomer(token)) return token
  const sdk = createCustomerSdk(token)
  if (!sdk) throw new Error("Authentication unavailable")
  const result = await sdk.client.fetch<CompleteGoogleAuthResponse>(
    "/auth/google/complete",
    {
      method: "POST",
      body: {
        actor_type: "customer",
        ...(existingToken ? { existing_token: existingToken } : {}),
      },
    },
  )
  if (!result || typeof result !== "object" || !("status" in result))
    throw new Error("Invalid completion response")
  if (result.status === "link_required") return null
  if (
    result.status !== "complete" ||
    !("token" in result) ||
    typeof result.token !== "string"
  )
    throw new Error("Invalid completion response")
  const canonicalSdk = createCustomerSdk(result.token)
  if (!canonicalSdk) throw new Error("Authentication unavailable")
  const refreshed = await canonicalSdk.auth.refresh()
  return "mfa_required" in refreshed || "verification_required" in refreshed
    ? refreshed
    : refreshed.token
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const store = await cookies()
  const transaction = readGoogleTransaction(
    store.get(GOOGLE_TRANSACTION_COOKIE)?.value,
    url.searchParams.get("state"),
  )
  store.delete(GOOGLE_TRANSACTION_COOKIE)
  if (!transaction) redirect("/login?google=expired")
  const loginPath = (code: string) =>
    `/login?google=${code}&next=${encodeURIComponent(transaction.next)}`
  if (url.searchParams.has("error"))
    redirect(
      loginPath(
        url.searchParams.get("error") === "access_denied"
          ? "cancelled"
          : "failed",
      ),
    )
  const code = url.searchParams.get("code")
  if (!code || code.length > 4096) redirect(loginPath("expired"))

  let destination = transaction.next
  try {
    let existingToken: string | undefined
    if (transaction.sessionHash) {
      existingToken = await getCustomerSessionToken()
      if (
        !existingToken ||
        createHash("sha256").update(existingToken).digest("hex") !==
          transaction.sessionHash
      ) {
        destination = loginPath("session_changed")
      }
    }
    if (destination === transaction.next) {
      const sdk = createCustomerSdk()
      if (!sdk) throw new Error("Authentication unavailable")
      let result: AuthCallbackResponse | null = await sdk.auth.callback(
        "customer",
        "google",
        { code, state: transaction.state },
      )
      if (
        typeof result !== "string" &&
        existingToken &&
        !sameGoogleAuthIdentity(result.token, existingToken)
      )
        throw new Error("Account conflict")
      if (typeof result === "string")
        result = await resolveCustomerGoogleToken(result, existingToken)
      if (result === null) {
        destination = `/login?google=link_required&next=${encodeURIComponent(`/auth/google/link?next=${encodeURIComponent(transaction.next)}`)}`
      } else if (typeof result === "string") {
        const authenticated = createCustomerSdk(result)
        if (!authenticated) throw new Error("Authentication unavailable")
        await authenticated.store.customer.retrieve()
        await setCustomerSession(result, transaction.next === "/account/sell")
      } else if ("mfa_required" in result) {
        await setMfaSecret({
          token: result.token,
          challengeId: result.mfa_challenge.id,
          methods: result.mfa_challenge.methods,
        })
        destination = loginPath("mfa_required")
      } else {
        const email = result.verification?.entity_id
        if (!email) throw new Error("Verification email unavailable")
        await setVerificationSecret({ token: result.token, email })
        destination = `/verify-email?next=${encodeURIComponent(transaction.next)}`
      }
    }
  } catch {
    destination = loginPath("failed")
  }
  redirect(destination)
}
