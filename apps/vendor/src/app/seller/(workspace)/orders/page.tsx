import type { Metadata } from "next";
import { Suspense } from "react";
import {
  OrderFilters,
  OrderList,
  OrderListSkeleton,
} from "@/features/orders/list-components";
import { orderListInput } from "@/features/orders/parameters";

export const metadata: Metadata = { title: "Pedidos" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    tab?: string | string[];
  }>;
}) {
  const input = orderListInput(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Pedidos de la tienda</h1>
      <OrderFilters input={input} />
      <Suspense
        key={`${input.q}:${input.tab.value}:${input.page}`}
        fallback={<OrderListSkeleton />}
      >
        <OrderList input={input} />
      </Suspense>
    </div>
  );
}
