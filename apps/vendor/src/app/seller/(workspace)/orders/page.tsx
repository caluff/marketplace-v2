import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";

import { DemoNotice } from "@/components/vendor/demo-notice";
import { EmptyState } from "@/components/vendor/empty-state";

export const metadata: Metadata = { title: "Pedidos" };

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Pedidos
        </p>
        <h1 className="mt-2 font-display text-3xl tracking-tight">
          Cola de preparación
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Contenedor visual sin acciones de cumplimiento ni conexión al backend.
        </p>
      </div>
      <DemoNotice />
      <EmptyState
        eyebrow="Estado vacío de muestra"
        title="No hay pedidos conectados"
        description="La tabla del inicio usa fixtures explícitos para revisar densidad y estados. Esta ruta no carga pedidos reales ni ofrece acciones operativas."
        icon={ShoppingBag}
      />
    </div>
  );
}
