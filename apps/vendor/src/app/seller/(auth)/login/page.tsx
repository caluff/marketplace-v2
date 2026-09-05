import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { VendorLoginForm } from "@/components/vendor/vendor-auth-forms";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";
import { getVendorContext, getVendorToken } from "@/lib/auth-sdk";
import { safeRedirectPath } from "@/lib/auth-utils";
import { sellerApplicationUrl } from "@/lib/storefront-url";

export const metadata: Metadata = { title: "Acceso de vendedor" };

export default async function SellerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next, "/seller");
  const context = await getVendorContext();
  if (context.status === "seller_unavailable") redirect("/seller/status");
  if (context.status === "authenticated") redirect(next);
  if (context.status === "seller_missing" && (await getVendorToken()))
    redirect(`/seller/select-seller?next=${encodeURIComponent(next)}`);
  const applicationUrl = sellerApplicationUrl();
  return (
    <VendorAuthShell
      title="Acceso de vendedor"
      description="Si tu solicitud ya fue aprobada, ingresa con el mismo correo y contraseña de tu cuenta de comprador."
    >
      <VendorLoginForm next={next} expired={params.reason === "expired"} />
      {applicationUrl ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Quieres vender?{" "}
          <a
            href={applicationUrl}
            className="font-semibold text-primary underline"
          >
            Solicita tu tienda desde tu cuenta
          </a>
        </p>
      ) : null}
    </VendorAuthShell>
  );
}
