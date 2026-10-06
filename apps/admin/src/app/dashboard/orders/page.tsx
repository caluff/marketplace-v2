import type { Metadata } from "next";
import { Suspense } from "react";
import {
  OrderFilters,
  OrderListSkeleton,
  OrderResults,
} from "@/features/orders/components";
import { parseOrderFilters } from "@/features/orders/helpers";

export const metadata: Metadata = { title: "Pedidos | usapeek Admin" };
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseOrderFilters(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Pedidos</h1>
      <OrderFilters filters={filters} />
      <Suspense key={JSON.stringify(filters)} fallback={<OrderListSkeleton />}>
        <OrderResults filters={filters} />
      </Suspense>
    </div>
  );
}
