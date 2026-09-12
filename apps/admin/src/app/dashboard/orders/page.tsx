import type { Metadata } from "next";
import { Suspense } from "react";
import {
  OrderFilters,
  OrderRegionSkeleton,
  OrderResults,
} from "@/features/orders/components";
import { parseOrderFilters } from "@/features/orders/helpers";

export const metadata: Metadata = { title: "Pedidos | Marketplace Admin" };
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseOrderFilters(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Pedidos
      </h1>
      <OrderFilters filters={filters} />
      <Suspense
        key={JSON.stringify(filters)}
        fallback={<OrderRegionSkeleton />}
      >
        <OrderResults filters={filters} />
      </Suspense>
    </div>
  );
}
