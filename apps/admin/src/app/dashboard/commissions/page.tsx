import type { Metadata } from "next";
import { Suspense } from "react";
import {
  CommissionPanel,
  CommissionSkeleton,
} from "@/features/commissions/components/commission-panel";

export const metadata: Metadata = { title: "Comisiones | Marketplace V2" };

export default function CommissionsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Comisiones</h1>
        <p className="text-sm text-muted-foreground">
          Consulta y ajusta el porcentaje global del marketplace.
        </p>
      </header>
      <Suspense fallback={<CommissionSkeleton />}>
        <CommissionPanel />
      </Suspense>
    </div>
  );
}
