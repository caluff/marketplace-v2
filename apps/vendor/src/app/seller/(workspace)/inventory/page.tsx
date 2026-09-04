import type { Metadata } from "next";
import { Boxes } from "lucide-react";

import { DemoNotice } from "@/components/vendor/demo-notice";
import { EmptyState } from "@/components/vendor/empty-state";

export const metadata: Metadata = { title: "Inventario" };

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Inventario
        </p>
        <h1 className="mt-2 font-display text-3xl tracking-tight">
          Señales de stock
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Superficie reservada para una lectura futura, sin controles de ajuste.
        </p>
      </div>
      <DemoNotice />
      <EmptyState
        eyebrow="Estado vacío de muestra"
        title="Sin niveles de stock conectados"
        description="Esta maqueta no crea depósitos, niveles ni reservas. La integración de inventario deberá respetar el alcance del vendedor antes de mostrar datos."
        icon={Boxes}
      />
    </div>
  );
}
