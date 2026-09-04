import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { VendorLoginForm } from "@/components/vendor/vendor-auth-forms";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";
import { getVendorContext, getVendorToken } from "@/lib/auth-sdk";
import { safeRedirectPath } from "@/lib/auth-utils";

export const metadata: Metadata = { title: "Acceso de vendedor" };

export default async function SellerLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next, "/seller");
  const context = await getVendorContext();
  if (context.status === "authenticated") redirect(next);
  if (context.status === "seller_missing" && await getVendorToken()) redirect(`/seller/select-seller?next=${encodeURIComponent(next)}`);
  return <VendorAuthShell title="Acceso de vendedor" description="Ingresa con tu identidad de miembro. El registro público permanece deshabilitado."><VendorLoginForm next={next} expired={params.reason === "expired"} /></VendorAuthShell>;
}
