"use server"

import { createHash } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  createCustomerSdk,
  getCurrentCustomer,
  getCustomerSessionToken,
} from "@/lib/auth-sdk"
import { packSecret, type AuthActionState } from "@/lib/auth-utils"
import {
  GOOGLE_TRANSACTION_COOKIE,
  GOOGLE_TRANSACTION_MAX_AGE,
  googleAuthorizationUrl,
  googleCallbackUrl,
  googleNextPath,
} from "@/lib/google-auth"

export async function startCustomerGoogleAction(
  _previous: AuthActionState,
  form: FormData,
): Promise<AuthActionState> {
  const callback = googleCallbackUrl(
    process.env.NEXT_PUBLIC_GOOGLE_CALLBACK_URL,
  )
  const sdk = createCustomerSdk()
  if (!callback || !sdk)
    return {
      status: "error",
      message: "El acceso con Google no está disponible en este momento.",
    }
  const next = googleNextPath(String(form.get("next") ?? "/account"))
  let sessionHash: string | undefined
  let location: string
  try {
    if (form.get("link") === "true") {
      const token = await getCustomerSessionToken()
      if (!token || !(await getCurrentCustomer()))
        return {
          status: "error",
          message: "Inicia sesión en tu cuenta antes de vincular Google.",
        }
      sessionHash = createHash("sha256").update(token).digest("hex")
    }
    const result = await sdk.auth.login("customer", "google", {
      callback_url: callback,
    })
    const authorization =
      typeof result !== "string" && "location" in result
        ? googleAuthorizationUrl(result.location, callback)
        : null
    if (!authorization)
      return {
        status: "error",
        message: "No pudimos iniciar el acceso con Google.",
      }
    ;(await cookies()).set(
      GOOGLE_TRANSACTION_COOKIE,
      packSecret({
        state: authorization.state,
        next,
        sessionHash,
        createdAt: Date.now(),
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: GOOGLE_TRANSACTION_MAX_AGE,
      },
    )
    location = authorization.location
  } catch {
    return {
      status: "error",
      message:
        "No pudimos conectar con el servicio de acceso. Inténtalo nuevamente.",
    }
  }
  redirect(location)
}
