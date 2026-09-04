import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminLoginForm } from "@/components/admin/admin-auth-forms";
import { ModeToggle } from "@/components/mode-toggle";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentAdmin } from "@/lib/auth-sdk";
import { safeRedirectPath } from "@/lib/auth-utils";

export const metadata: Metadata = {
  title: "Acceso | Marketplace Admin",
  description: "Acceso seguro para operadores del marketplace.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next, "/dashboard");
  if (await getCurrentAdmin()) redirect(next);

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-sidebar px-4 py-10 text-sidebar-foreground">
      <ModeToggle className="absolute right-4 top-4 z-10 bg-background text-foreground" />
      <div
        className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_18%_14%,oklch(0.71_0.13_151/0.18),transparent_28%),radial-gradient(circle_at_86%_88%,oklch(0.58_0.12_246/0.16),transparent_26%)]"
        aria-hidden="true"
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
            <CardTitle className="text-xl tracking-[-0.035em]">
              Acceso de operadores
            </CardTitle>
            <CardDescription className="max-w-xs">
              Identifícate con una cuenta de operador autorizada.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-2">
            <AdminLoginForm
              next={next}
              expired={params.reason === "expired"}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
