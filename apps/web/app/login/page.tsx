import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { CustomerLoginForm } from "@/components/auth/auth-forms"
import { AuthShell } from "@/components/auth/auth-shell"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import { safeRedirectPath } from "@/lib/auth-utils"

export const metadata: Metadata = { title: "Iniciar sesión | mercado / v2" }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reason?: string }> }) {
  const params = await searchParams
  if (await getCurrentCustomer()) redirect(safeRedirectPath(params.next, "/account"))
  return <AuthShell eyebrow="Acceso" title="Bienvenido de nuevo" description="Recupera tu perfil y continúa desde donde lo dejaste."><CustomerLoginForm next={safeRedirectPath(params.next, "/account")} expired={params.reason === "expired"} /></AuthShell>
}
