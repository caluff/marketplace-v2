import { Store } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { ModeToggle } from "@/components/mode-toggle"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

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
    <main className="relative grid min-h-dvh bg-background font-sans lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)]">
      <ModeToggle className="absolute top-4 right-4 z-10 size-11 bg-background" />
      <section className="relative hidden overflow-hidden bg-(--auth-sidebar) p-12 text-(--auth-sidebar-foreground) [--auth-sidebar:oklch(0.205_0_0)] [--auth-sidebar-foreground:oklch(0.985_0_0)] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--brand-accent)_28%,transparent),transparent_28rem)]" aria-hidden="true" />
        <Link href="/" className="relative flex min-h-11 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-accent">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-accent text-brand-accent-foreground">
            <Store className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-xl">Marketplace V2</span>
            <span className="block text-xs font-semibold tracking-[0.18em] uppercase text-(--auth-sidebar-foreground)/65">Cuenta de cliente</span>
          </span>
        </Link>
        <div className="relative max-w-xl">
          <p className="mb-5 text-xs font-bold tracking-[0.2em] uppercase text-(--auth-sidebar-foreground)/75">Tu espacio personal</p>
          <p className="text-5xl leading-[1.08] tracking-tight">Tu selección, guardada con criterio.</p>
          <p className="mt-5 max-w-lg text-base leading-7 text-(--auth-sidebar-foreground)/65">Accede a tu perfil sin interrumpir la exploración del catálogo. Comprar como invitado sigue estando disponible.</p>
        </div>
        <p className="relative text-xs text-(--auth-sidebar-foreground)/65">Tu cuenta, en un solo lugar.</p>
      </section>
      <section className="flex min-w-0 items-center justify-center px-5 pt-20 pb-10 sm:px-10 lg:py-20">
        <Card className="w-full max-w-md gap-0 rounded-xl border-border/80 shadow-sm">
          <CardHeader className="gap-1.5 pt-5 pb-4">
            <Link href="/" className="mb-2 flex min-h-11 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                <Store className="size-5" aria-hidden="true" />
              </span>
              <span className="text-xl">Marketplace V2</span>
            </Link>
            <p className="sr-only">{eyebrow}</p>
            <CardTitle className="pt-2 text-3xl leading-normal font-normal tracking-tight">
              <h1>{title}</h1>
            </CardTitle>
            <CardDescription className="leading-6">{description}</CardDescription>
          </CardHeader>
          <CardContent className="pb-6">{children}</CardContent>
        </Card>
      </section>
    </main>
  )
}
