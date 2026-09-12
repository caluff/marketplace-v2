import type { AuthLoginResponse } from "@medusajs/js-sdk";
import { redirect } from "next/navigation";
import { adminLoginErrorMessage } from "@/lib/auth-service";
import { createAdminSdk, setAdminSession, setAdminVerification, setAdminMfa } from "@/lib/auth-sdk";
import { type AuthActionState, safeRedirectPath, safeExternalAuthUrl } from "@/lib/auth-utils";
const configurationError = (): AuthActionState => ({ status: "error", message: "El servicio de acceso no está disponible. Intenta más tarde." });

export async function completeAdminLogin(
  result: AuthLoginResponse,
  email: string,
  next: string,
): Promise<AuthActionState> {
  if (typeof result === "string") {
    const authenticated = createAdminSdk(result);
    if (!authenticated) return configurationError();
    try {
      await authenticated.admin.user.me();
    } catch (error) {
      return { status: "error", message: adminLoginErrorMessage(error) };
    }
    await setAdminSession(result);
    redirect(safeRedirectPath(next, "/dashboard"));
  }

  if ("verification_required" in result) {
    email = email || result.verification?.entity_id || "";
    await setAdminVerification({ token: result.token, email });
    try {
      await createAdminSdk(result.token)?.auth.verification.request({
        entity_id: email,
        entity_type: "email",
        metadata: { actor_type: "user" },
      });
    } catch {
      // The current code can still be valid; retry remains available.
    }
    redirect(`/verify-email?next=${encodeURIComponent(next)}`);
  }

  if ("mfa_required" in result) {
    await setAdminMfa({
      token: result.token,
      challengeId: result.mfa_challenge.id,
      methods: result.mfa_challenge.methods,
    });
    return {
      status: "mfa_required",
      message: "Confirma el segundo factor para continuar.",
      mfaMethods: result.mfa_challenge.methods,
    };
  }

  const externalUrl = safeExternalAuthUrl(result.location);
  return externalUrl
    ? {
        status: "external_redirect",
        message: "El proveedor requiere completar el acceso en otra página.",
        externalUrl,
      }
    : { status: "error", message: "El proveedor devolvió una redirección no válida." };
}

