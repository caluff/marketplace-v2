import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";

import { DemoNotice } from "@/components/vendor/demo-notice";
import { EmptyState } from "@/components/vendor/empty-state";

export const metadata: Metadata = { title: "Catálogo" };

export default function CatalogPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          Catálogo
        </p>
        <h1 className="mt-2 font-display text-3xl tracking-tight">
          Publicaciones de la tienda
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Esta ruta reserva el espacio para una futura vista acotada del
          catálogo; todavía no permite crear ni editar publicaciones.
        </p>
      </div>
      <DemoNotice />
      <EmptyState
        eyebrow="Módulo en preparación"
        title="Aún no hay publicaciones en esta maqueta"
        description="Cuando se conecte una fuente de datos autorizada, esta vista podrá mostrar publicaciones del vendedor. Por ahora no consulta ni modifica el catálogo real."
        icon={PackageSearch}
      />
    </div>
  );
}
