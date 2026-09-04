import { BellOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function OperationalEmptyState() {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-6 py-8 text-center">
      <span className="mb-4 grid size-11 place-items-center rounded-xl border border-border bg-muted/60 text-muted-foreground">
        <BellOff className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-sm font-semibold">Sin alertas en este fixture</p>
        <Badge variant="outline" className="text-[9px] uppercase">
          Demo
        </Badge>
      </div>
      <p className="max-w-sm text-xs leading-5 text-muted-foreground">
        Este estado vacío muestra cómo se verá el panel cuando no haya señales
        operativas que requieran atención.
      </p>
    </div>
  );
}
