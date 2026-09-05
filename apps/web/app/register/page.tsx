import type { Metadata } from "next"
import { CustomerRegisterForm } from "@/components/auth/auth-forms"
import { AuthShell } from "@/components/auth/auth-shell"

export const metadata: Metadata = { title: "Crear cuenta | Marketplace V2" }
export default function RegisterPage() {
  return <AuthShell eyebrow="Registro" title="Crea tu cuenta" description="Guarda tus datos de cliente sin perder la posibilidad de navegar y comprar como invitado."><CustomerRegisterForm /></AuthShell>
}
