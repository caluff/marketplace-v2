import { FlaskConical } from "lucide-react";

import { DEMO_DISCLAIMER } from "@/lib/demo-data";

export function DemoNotice() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning-foreground"
    >
      <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">Datos de demostración</p>
        <p className="mt-0.5 leading-5 opacity-80">{DEMO_DISCLAIMER}</p>
      </div>
    </div>
  );
}
