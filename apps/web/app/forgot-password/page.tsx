import type { Metadata } from "next"
import { CustomerForgotPasswordForm } from "@/components/auth/auth-forms"
import { AuthShell } from "@/components/auth/auth-shell"

export const metadata: Metadata = { title: "Recuperar contraseña | mercado / v2" }
export default function ForgotPasswordPage() {
  return <AuthShell eyebrow="Recuperación" title="Recupera tu acceso" description="Te enviaremos instrucciones si encontramos una cuenta asociada al correo."><CustomerForgotPasswordForm /></AuthShell>
}
