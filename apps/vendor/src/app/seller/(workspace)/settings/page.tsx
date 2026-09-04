import type { Metadata } from "next";
import { Settings2 } from "lucide-react";

import { DemoNotice } from "@/components/vendor/demo-notice";
import { EmptyState } from "@/components/vendor/empty-state";

export const metadata: Metadata = { title: "Ajustes" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Ajustes
        </p>
        <h1 className="mt-2 font-display text-3xl tracking-tight">
          Preferencias del portal
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Estructura visual únicamente; ninguna preferencia se guarda.
        </p>
      </div>
      <DemoNotice />
      <EmptyState
        eyebrow="Módulo en preparación"
        title="Ajustes aún no disponibles"
        description="La configuración de la cuenta se conectará cuando exista un contrato de datos y permisos definido. Esta maqueta no inicia registro ni onboarding."
        icon={Settings2}
      />
    </div>
  );
}
