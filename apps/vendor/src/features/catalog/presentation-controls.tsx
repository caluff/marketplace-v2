"use client";

import { useId, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PresentationControls({
  children,
  hasPending,
}: {
  children: ReactNode;
  hasPending: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          Presentaciones, precios y existencias
        </h2>
        <Button
          type="button"
          variant="outline"
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-describedby={hasPending ? `${panelId}-pending` : undefined}
          disabled={hasPending}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {isOpen ? "Cerrar presentaciones" : "Añadir presentación"}
        </Button>
      </div>
      {hasPending ? (
        <p id={`${panelId}-pending`} className="text-sm text-muted-foreground">
          Hay una solicitud pendiente de revisión. Podrás añadir tamaños,
          colores u otras presentaciones cuando se resuelva.
        </p>
      ) : null}
      <div id={panelId} hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}
