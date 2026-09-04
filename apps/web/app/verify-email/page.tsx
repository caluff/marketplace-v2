import type { Metadata } from "next"
import { CustomerVerifyEmailForm } from "@/components/auth/auth-forms"
import { AuthShell } from "@/components/auth/auth-shell"
import { getVerificationCode } from "@/lib/auth-sdk"
import { safeRedirectPath } from "@/lib/auth-utils"

export const metadata: Metadata = { title: "Verificar correo | mercado / v2", robots: { index: false, follow: false } }
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next, "/account")
  return <AuthShell eyebrow="Verificación" title="Confirma tu correo" description="Usa el código enviado a tu dirección para activar el acceso."><CustomerVerifyEmailForm hasCode={Boolean(await getVerificationCode())} next={next} /></AuthShell>
}
