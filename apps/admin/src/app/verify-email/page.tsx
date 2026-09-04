import type { Metadata } from "next";

import { AdminVerifyForm } from "@/components/admin/admin-auth-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminVerificationCode } from "@/lib/auth-sdk";
import { safeRedirectPath } from "@/lib/auth-utils";

export const metadata: Metadata = {
  title: "Verificar correo | Marketplace Admin",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeRedirectPath((await searchParams).next, "/dashboard");
  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Verificar correo</CardTitle>
          <CardDescription>
            Confirma el código de tu identidad de operador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminVerifyForm
            hasCode={Boolean(await getAdminVerificationCode())}
            next={next}
          />
        </CardContent>
      </Card>
    </main>
  );
}
