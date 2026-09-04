import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole, Store } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Acceso de demostración" };

export default function SellerLoginPage() {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)]">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_20%,color-mix(in_oklab,var(--sidebar-primary)_28%,transparent),transparent_28rem)]" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Store className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-xl">Mercado Sur</p>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">
              Portal vendedor
            </p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <Badge className="mb-5 border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
            Maqueta de acceso
          </Badge>
          <h1 className="font-display text-5xl leading-[1.08] tracking-tight">
            Menos ruido. Más claridad para operar tu tienda.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-sidebar-foreground/65">
            Este shell define la entrada visual al portal. No autentica, no
            conserva credenciales y no habilita altas públicas.
          </p>
        </div>
        <p className="relative text-xs text-sidebar-foreground/45">
          Interfaz de demostración · Sin conexión a datos reales
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <Button asChild variant="ghost" size="sm" className="mb-6 -ml-3">
            <Link href="/seller">
              <ArrowLeft aria-hidden="true" />
              Volver al panel demo
            </Link>
          </Button>
          <Card>
            <CardHeader className="pb-4">
              <span className="mb-2 grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground lg:hidden">
                <Store className="size-5" aria-hidden="true" />
              </span>
              <Badge variant="warning">No conectado</Badge>
              <CardTitle className="pt-2 font-display text-3xl font-normal">
                Acceso de vendedor
              </CardTitle>
              <CardDescription className="leading-6">
                Estructura visual solamente. Los campos están desactivados y el
                formulario no envía información.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-5"
                aria-label="Maqueta de acceso sin autenticación"
              >
                <div className="space-y-2">
                  <Label htmlFor="demo-email">Correo</Label>
                  <Input
                    id="demo-email"
                    type="email"
                    placeholder="vendedor@ejemplo.test"
                    autoComplete="username"
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="demo-password">Contraseña</Label>
                  <Input
                    id="demo-password"
                    type="password"
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    disabled
                  />
                </div>
                <Button type="button" className="w-full" disabled>
                  <LockKeyhole aria-hidden="true" />
                  Ingresar · próximamente
                </Button>
              </form>
              <div className="mt-5 rounded-lg border border-border bg-muted/65 px-4 py-3 text-xs leading-5 text-muted-foreground">
                El registro público permanece fuera de alcance. No se incluyen
                enlaces de alta, onboarding ni recuperación de cuenta.
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
