import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import {
  StoreDetailRegion,
  StoreRegionSkeleton,
} from "@/features/stores/components";

export const metadata: Metadata = {
  title: "Detalle de tienda | Marketplace Admin",
};

export default async function StorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/stores"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Tiendas
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Detalle de tienda
      </h1>
      <Suspense key={id} fallback={<StoreRegionSkeleton />}>
        <StoreDetailRegion id={id} />
      </Suspense>
    </div>
  );
}
