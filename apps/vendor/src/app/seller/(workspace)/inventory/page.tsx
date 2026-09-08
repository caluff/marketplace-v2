import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/features/workspace/components";
import { resultOf, workspace } from "@/features/workspace/data";
import { sellerWarehouse } from "@/features/inventory/data";
import {
  WarehouseCard,
  InventorySkeleton,
} from "@/features/inventory/warehouse-card";
import { InventoryResults } from "@/features/inventory/inventory-results";

export const metadata: Metadata = { title: "Inventario" };
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { client } = await workspace();
  const warehouse = resultOf(sellerWarehouse(client));
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Inventario"
        title="Existencias de tu almacén"
        description="Consulta las unidades físicas, reservadas y disponibles en el almacén de tu solicitud aprobada."
      >
        <Button asChild variant="outline">
          <Link href="/seller/inventory/locations">Ver almacén</Link>
        </Button>
      </PageHeading>
      <Suspense fallback={<InventorySkeleton warehouse />}>
        <WarehouseCard result={warehouse} />
      </Suspense>
      <Suspense fallback={<InventorySkeleton />}>
        <InventoryResults
          client={client}
          searchParams={searchParams}
          warehouse={warehouse}
        />
      </Suspense>
    </div>
  );
}
