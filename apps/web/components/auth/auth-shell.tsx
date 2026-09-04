import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(18rem,0.8fr)_minmax(28rem,1.2fr)]">
      <section className="relative hidden overflow-hidden border-r border-border bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="absolute inset-0 opacity-15 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_26px,currentColor_27px,currentColor_28px)]" aria-hidden="true" />
        <Link href="/" className="relative inline-flex min-h-11 items-center font-sans text-sm font-black tracking-[0.18em] uppercase outline-none focus-visible:ring-3 focus-visible:ring-accent">
          mercado / v2
        </Link>
        <div className="relative max-w-lg">
          <p className="font-sans text-xs font-black tracking-[0.18em] uppercase text-accent">Cuenta de cliente</p>
          <p className="mt-5 text-5xl leading-[1.04]">Tu selección, guardada con criterio.</p>
          <p className="mt-5 max-w-md font-sans text-sm leading-6 text-primary-foreground/70">Accede a tu perfil sin interrumpir la exploración del catálogo. Comprar como invitado sigue estando disponible.</p>
        </div>
        <p className="relative flex items-center gap-2 font-sans text-xs text-primary-foreground/60"><ShieldCheck className="size-4" aria-hidden="true" /> Sesión protegida por el backend de Medusa</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md border border-border bg-card p-6 shadow-[8px_8px_0_var(--foreground)] sm:p-8">
          <Link href="/" className="mb-8 inline-flex min-h-11 items-center font-sans text-xs font-black tracking-[0.14em] uppercase text-muted-foreground outline-none hover:text-accent focus-visible:ring-3 focus-visible:ring-ring/40 lg:hidden">mercado / v2</Link>
          <p className="font-sans text-xs font-black tracking-[0.16em] uppercase text-accent">{eyebrow}</p>
          <h1 className="mt-3 text-4xl leading-none">{title}</h1>
          <p className="mt-4 font-sans text-sm leading-6 text-muted-foreground">{description}</p>
          <div className="mt-7">{children}</div>
        </div>
      </section>
    </main>
  )
}
