import type { Metadata } from "next";
import { VendorResetForm } from "@/components/vendor/vendor-auth-forms";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";
import { getVendorReset } from "@/lib/auth-sdk";

export const metadata: Metadata = { title: "Nueva contraseña", robots: { index: false, follow: false } };
export default async function ResetVendorPasswordPage() { return <VendorAuthShell title="Nueva contraseña" description="El enlace es temporal y de un solo uso."><VendorResetForm hasToken={Boolean(await getVendorReset())} /></VendorAuthShell>; }
