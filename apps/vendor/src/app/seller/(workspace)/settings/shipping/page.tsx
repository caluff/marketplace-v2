import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeading } from "@/features/workspace/components";
import { ShippingSettings } from "@/features/shipping/shipping-settings";

export const metadata: Metadata = { title: "Envíos" };

export default function ShippingPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeading eyebrow="Ajustes" title="Envíos" />
      <Suspense
        fallback={
          <div
            className="space-y-6"
            aria-label="Cargando configuración de envíos"
          >
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        }
      >
        <ShippingSettings />
      </Suspense>
    </div>
  );
}
