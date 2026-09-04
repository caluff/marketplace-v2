import { Store } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function VendorAuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--sidebar-primary)_28%,transparent),transparent_28rem)]" aria-hidden="true" />
        <Link href="/seller/login" className="relative flex min-h-11 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"><span className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Store className="size-5" aria-hidden="true" /></span><span><span className="block font-display text-xl">Mercado Sur</span><span className="block text-xs font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">Portal vendedor</span></span></Link>
        <div className="relative max-w-xl"><p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-sidebar-primary">Operación segura</p><p className="font-display text-5xl leading-[1.08] tracking-tight">Menos ruido. Más claridad para operar tu tienda.</p><p className="mt-5 max-w-lg text-base leading-7 text-sidebar-foreground/65">El acceso está reservado a miembros previamente creados o invitados por una tienda.</p></div>
        <p className="relative text-xs text-sidebar-foreground/45">Autenticación y permisos administrados por Mercur</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10 sm:px-10"><div className="w-full max-w-md"><Card><CardHeader className="pb-4"><span className="mb-2 grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground lg:hidden"><Store className="size-5" aria-hidden="true" /></span><CardTitle className="pt-2 font-display text-3xl font-normal">{title}</CardTitle><CardDescription className="leading-6">{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card></div></section>
    </main>
  );
}
