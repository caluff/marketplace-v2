import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function DemoBanner() {
  return (
    <aside
      aria-label="Aviso de datos de demostración"
      className="flex flex-col gap-3 rounded-xl border border-demo/20 bg-demo/8 px-4 py-3 text-demo-foreground sm:flex-row sm:items-center"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-demo/12">
        <Info className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Panel en modo demostración</p>
          <Badge className="border-demo/20 bg-demo/10 text-demo-foreground">
            Sin conexión al backend
          </Badge>
        </div>
        <p className="text-xs leading-5 text-demo-foreground/75">
          Todas las cifras, nombres e identificadores de esta pantalla son
          fixtures sintéticos y no representan operaciones reales.
        </p>
      </div>
    </aside>
  );
}
