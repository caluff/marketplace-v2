import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Boxes, LockKeyhole, Mail, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Acceso | Marketplace Admin",
  description: "Shell visual de acceso; autenticación todavía no implementada.",
};

export default function LoginPage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-sidebar px-4 py-10 text-sidebar-foreground">
      <ModeToggle className="absolute right-4 top-4 z-10 bg-background text-foreground" />
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 14%, oklch(0.71 0.13 151 / 0.18), transparent 28%), radial-gradient(circle at 86% 88%, oklch(0.58 0.12 246 / 0.16), transparent 26%)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 grid size-11 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-lg">
            <Boxes className="size-5" aria-hidden="true" />
          </span>
          <p className="text-base font-semibold tracking-[-0.02em]">
            Marketplace Admin
          </p>
          <p className="mt-1 text-xs text-sidebar-muted">
            Espacio de operaciones
          </p>
        </div>

        <Card className="border-white/8 bg-card text-card-foreground shadow-2xl">
          <CardHeader className="items-center px-6 pt-6 text-center">
            <Badge variant="outline" className="mb-2 uppercase">
              Shell de demostración
            </Badge>
            <CardTitle className="text-xl tracking-[-0.035em]">
              Acceso de operadores
            </CardTitle>
            <CardDescription className="max-w-xs">
              Esta pantalla define el flujo visual. La autenticación final no
              está conectada.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-2">
            <form
              className="space-y-4"
              aria-label="Formulario visual de acceso"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="email"
                    data-testid="login-email-disabled"
                    type="email"
                    autoComplete="email"
                    placeholder="operador@ejemplo.test"
                    className="pl-9"
                    disabled
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <LockKeyhole
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="password"
                    data-testid="login-password-disabled"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    className="pl-9"
                    disabled
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled
                data-testid="login-submit-disabled"
              >
                Continuar
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <Separator />
              <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                No operativo
              </span>
              <Separator />
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/8 p-3 text-success-foreground">
              <ShieldCheck
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <p className="text-xs leading-5">
                No se capturan credenciales ni se envían datos desde este
                prototipo.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Link
            href="/dashboard"
            data-testid="back-to-dashboard"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Volver al panel de demostración
          </Link>
        </div>
      </div>
    </main>
  );
}
