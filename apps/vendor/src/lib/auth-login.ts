import type { AuthLoginResponse } from "@medusajs/js-sdk";
import { redirect } from "next/navigation";
import { createVendorSdk, setVendorSession, setVendorVerification, setVendorMfa, listVendorMemberships, clearVendorSeller, setVendorSeller, selectAndRetrieveVendor } from "@/lib/auth-sdk";
import { type VendorAuthActionState, safeExternalAuthUrl, sellerChoice } from "@/lib/auth-utils";

export async function finishVendorToken(token: string, next: string): Promise<VendorAuthActionState> {
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

export async function completeVendorLogin(result: AuthLoginResponse, email: string, next: string): Promise<VendorAuthActionState> {
  if (typeof result === "string") return finishVendorToken(result, next);
  if ("verification_required" in result) {
    email = email || result.verification?.entity_id || "";
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

