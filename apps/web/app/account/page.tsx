import { LogOut, UserRound } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { logoutCustomerAction } from "@/app/auth-actions"
import { Button } from "@/components/ui/button"
import { getCurrentCustomer } from "@/lib/auth-sdk"

export const metadata: Metadata = { title: "Mi cuenta | mercado / v2" }
export const dynamic = "force-dynamic"

export default async function AccountPage() {
  const customer = await getCurrentCustomer()
  if (!customer) redirect("/login?reason=expired&next=%2Faccount")
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Cliente"
  return (
    <main className="min-h-dvh bg-background px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <a href="#account-content" className="fixed left-4 top-3 -translate-y-20 bg-primary px-3 py-2 font-sans text-sm text-primary-foreground focus:translate-y-0">Saltar al contenido</a>
        <nav className="mb-12 flex items-center justify-between border-b border-border pb-4" aria-label="Cuenta">
          <Link href="/" className="inline-flex min-h-11 items-center font-sans text-sm font-black tracking-[0.18em] uppercase">mercado / v2</Link>
          <form action={logoutCustomerAction}><Button type="submit" variant="outline"><LogOut className="size-4" aria-hidden="true" /> Cerrar sesión</Button></form>
        </nav>
        <section id="account-content" className="border border-border bg-card p-6 shadow-[8px_8px_0_var(--foreground)] sm:p-10">
          <UserRound className="size-8 text-accent" aria-hidden="true" />
          <p className="mt-8 font-sans text-xs font-black tracking-[0.16em] uppercase text-accent">Mi cuenta</p>
          <h1 className="mt-3 text-5xl leading-none">Hola, {name}</h1>
          <dl className="mt-8 grid gap-3 border-t border-border pt-6 font-sans sm:grid-cols-[10rem_1fr]">
            <dt className="text-sm font-bold text-muted-foreground">Correo</dt><dd className="break-all text-sm">{customer.email}</dd>
            <dt className="text-sm font-bold text-muted-foreground">Identificador</dt><dd className="break-all font-mono text-xs">{customer.id}</dd>
          </dl>
        </section>
      </div>
    </main>
  )
}
