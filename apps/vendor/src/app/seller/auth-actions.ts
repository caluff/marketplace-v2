"use server";

import { FetchError, type AuthLoginResponse } from "@medusajs/js-sdk";
import { redirect } from "next/navigation";

import {
  clearVendorReset,
  clearVendorSeller,
  clearVendorSession,
  clearVendorVerification,
  createVendorSdk,
  getVendorMfa,
  getVendorReset,
  getVendorToken,
  getVendorVerification,
  getVendorVerificationCode,
  listVendorMemberships,
  selectAndRetrieveVendor,
  setVendorMfa,
  setVendorSeller,
  setVendorSession,
  setVendorVerification,
} from "@/lib/auth-sdk";
import {
  type VendorAuthActionState,
  normalizeEmail,
  safeExternalAuthUrl,
  safeRedirectPath,
  sellerChoice,
  validateCredentials,
} from "@/lib/auth-utils";

const INVALID_CREDENTIALS = "No pudimos iniciar sesión con esos datos. Revisa el correo y la contraseña.";
const configurationError = (): VendorAuthActionState => ({ status: "error", message: "La autenticación no está configurada. Revisa NEXT_PUBLIC_MEDUSA_BACKEND_URL." });

async function finishVendorToken(token: string, next: string): Promise<VendorAuthActionState> {
  let memberships;
  try {
    memberships = (await listVendorMemberships(token)).filter((entry) => entry.member?.is_active);
  } catch {
    return { status: "error", message: "No pudimos recuperar tus tiendas. Inténtalo nuevamente." };
  }
  await setVendorSession(token);
  await clearVendorSeller();
  const choice = sellerChoice(memberships.length);
  if (choice === "none") redirect("/seller/no-access");
  if (choice === "multiple") redirect(`/seller/select-seller?next=${encodeURIComponent(next)}`);

  const membership = memberships[0];
  if (!membership) redirect("/seller/no-access");
  if (membership.seller.status !== "open") {
    await setVendorSeller(membership.seller.id);
    redirect("/seller/status");
  }
  let current;
  try {
    current = await selectAndRetrieveVendor(token, membership.seller.id);
  } catch {
    return { status: "error", message: "No pudimos seleccionar la tienda asociada." };
  }
  if (!current.member?.is_active || current.seller.id !== membership.seller.id) redirect("/seller/no-access");
  await setVendorSeller(membership.seller.id);
  redirect(next);
}

async function completeVendorLogin(result: AuthLoginResponse, email: string, next: string): Promise<VendorAuthActionState> {
  if (typeof result === "string") return finishVendorToken(result, next);
  if ("verification_required" in result) {
    await setVendorVerification({ token: result.token, email });
    try {
      await createVendorSdk(result.token)?.auth.verification.request({
        entity_id: email,
        entity_type: "email",
        metadata: { actor_type: "member" },
      });
    } catch {
      // Existing verification code may still be valid.
    }
    redirect(`/seller/verify-email?next=${encodeURIComponent(next)}`);
  }
  if ("mfa_required" in result) {
    await setVendorMfa({ token: result.token, challengeId: result.mfa_challenge.id, methods: result.mfa_challenge.methods });
    return { status: "mfa_required", message: "Confirma el segundo factor para continuar.", mfaMethods: result.mfa_challenge.methods };
  }
  const externalUrl = safeExternalAuthUrl(result.location);
  return externalUrl ? { status: "external_redirect", message: "El proveedor requiere completar el acceso en otra página.", externalUrl } : { status: "error", message: "El proveedor devolvió una redirección no válida." };
}

export async function loginVendorAction(_previous: VendorAuthActionState, formData: FormData): Promise<VendorAuthActionState> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectPath(formData.get("next"), "/seller");
  const fieldErrors = validateCredentials(email, password);
  if (Object.keys(fieldErrors).length) return { status: "error", message: "Revisa los campos indicados.", fieldErrors };
  const sdk = createVendorSdk();
  if (!sdk) return configurationError();
  try {
    return completeVendorLogin(await sdk.auth.login("member", "emailpass", { email, password }), email, next);
  } catch (error) {
    const isDenied = error instanceof FetchError && (error.status === 401 || error.status === 403);
    return {
      status: "error",
      message: isDenied
        ? INVALID_CREDENTIALS
        : "No pudimos conectar con el servicio de acceso. Intenta nuevamente en unos momentos.",
    };
  }
}

export async function verifyVendorMfaAction(_previous: VendorAuthActionState, formData: FormData): Promise<VendorAuthActionState> {
  const secret = await getVendorMfa();
  const code = String(formData.get("code") ?? "").trim();
  const next = safeRedirectPath(formData.get("next"), "/seller");
  if (!secret) return { status: "error", message: "El desafío venció. Inicia sesión nuevamente." };
  const method = String(formData.get("method") ?? secret.methods[0] ?? "totp");
  if (!code || code.length > 128 || !secret.methods.includes(method)) return { status: "mfa_required", message: "Ingresa un código válido.", fieldErrors: { code: "El código es obligatorio." }, mfaMethods: secret.methods };
  const sdk = createVendorSdk(secret.token);
  if (!sdk) return configurationError();
  try {
    const token = await sdk.auth.mfa.verifyChallenge(secret.challengeId, { method, code });
    return finishVendorToken(token, next);
  } catch {
    return { status: "mfa_required", message: "No pudimos validar el código.", mfaMethods: secret.methods };
  }
}

export async function selectVendorSellerAction(_previous: VendorAuthActionState, formData: FormData): Promise<VendorAuthActionState> {
  const token = await getVendorToken();
  const sellerId = String(formData.get("sellerId") ?? "");
  const next = safeRedirectPath(formData.get("next"), "/seller");
  if (!token) redirect(`/seller/login?next=${encodeURIComponent(next)}`);
  try {
    const memberships = await listVendorMemberships(token);
    const selected = memberships.find((entry) => entry.seller.id === sellerId);
    if (!selected) return { status: "error", message: "La tienda seleccionada ya no está disponible.", fieldErrors: { seller: "Selecciona una tienda válida." } };
    if (!selected.member?.is_active) return { status: "error", message: "Tu membresía está inactiva." };
    if (selected.seller.status !== "open") {
      await setVendorSeller(sellerId);
    } else {
      const current = await selectAndRetrieveVendor(token, sellerId);
      if (!current.member?.is_active || current.seller.id !== sellerId) return { status: "error", message: "No tienes acceso a esa tienda." };
      await setVendorSeller(sellerId);
    }
  } catch {
    return { status: "error", message: "No pudimos seleccionar la tienda. Tu acceso puede haber cambiado." };
  }
  redirect(next);
}

export async function forgotVendorPasswordAction(_previous: VendorAuthActionState, formData: FormData): Promise<VendorAuthActionState> {
  const email = normalizeEmail(formData.get("email"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { status: "error", message: "Revisa el correo indicado.", fieldErrors: { email: "Ingresa un correo válido." } };
  const sdk = createVendorSdk();
  if (!sdk) return configurationError();
  try {
    await sdk.auth.resetPassword("member", "emailpass", {
      identifier: email,
      metadata: { actor_type: "member" },
    });
  } catch {
    // Deliberately indistinguishable from a successful request.
  }
  return { status: "success", message: "Si existe una cuenta con ese correo, recibirás instrucciones para restablecer la contraseña." };
}

export async function resetVendorPasswordAction(_previous: VendorAuthActionState, formData: FormData): Promise<VendorAuthActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const secret = await getVendorReset();
  if (password.length < 8 || password.length > 256) return { status: "error", message: "Usa una contraseña de entre 8 y 256 caracteres.", fieldErrors: { password: "Contraseña no válida." } };
  if (password !== confirmation) return { status: "error", message: "Las contraseñas no coinciden." };
  if (!secret?.token) return { status: "error", message: "El enlace no es válido o ya venció." };
  const sdk = createVendorSdk();
  if (!sdk) return configurationError();
  try {
    await sdk.auth.updateProvider("member", "emailpass", { password }, secret.token);
    await clearVendorReset();
    return { status: "success", message: "Contraseña actualizada. Ya puedes iniciar sesión." };
  } catch {
    return { status: "error", message: "El enlace no es válido o ya venció." };
  }
}

export async function confirmVendorEmailAction(_previous: VendorAuthActionState, formData: FormData): Promise<VendorAuthActionState> {
  const code = String(formData.get("code") ?? "").trim() || (await getVendorVerificationCode()) || "";
  const secret = await getVendorVerification();
  const sdk = createVendorSdk(secret?.token);
  if (!code || code.length > 512) return { status: "error", message: "Ingresa un código válido.", fieldErrors: { code: "El código es obligatorio." } };
  if (!sdk) return configurationError();
  try {
    await sdk.auth.verification.confirm({ code });
    await clearVendorVerification();
    return { status: "success", message: "Correo verificado. Inicia sesión para continuar." };
  } catch {
    return { status: "error", message: "El código no es válido o ya venció." };
  }
}

export async function resendVendorVerificationAction(): Promise<VendorAuthActionState> {
  const secret = await getVendorVerification();
  const sdk = createVendorSdk(secret?.token);
  if (!secret || !sdk) return { status: "error", message: "Inicia sesión nuevamente para pedir otro código." };
  try {
    await sdk.auth.verification.request({
      entity_id: secret.email,
      entity_type: "email",
      metadata: { actor_type: "member" },
    });
    return { status: "success", message: "Enviamos un nuevo código." };
  } catch {
    return { status: "error", message: "No pudimos enviar otro código ahora." };
  }
}

export async function logoutVendorAction() {
  const sdk = createVendorSdk();
  try {
    await sdk?.auth.logout();
  } finally {
    await clearVendorSession();
  }
  redirect("/seller/login");
}
