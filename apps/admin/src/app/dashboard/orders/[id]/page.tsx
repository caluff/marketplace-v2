import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  OrderDetailRegion,
  OrderRegionSkeleton,
} from "@/features/orders/components";

import {
  OrderFinanceRegion,
  OrderFinanceSkeleton,
} from "@/features/orders/finance-region";

export const metadata: Metadata = {
  title: "Detalle del pedido | Marketplace Admin",
};
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/orders"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Pedidos
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Detalle del pedido
      </h1>
      <Suspense fallback={<OrderRegionSkeleton />}>
        <OrderDetailRegion id={id} />
      </Suspense>
      <Suspense fallback={<OrderFinanceSkeleton />}>
        <OrderFinanceRegion id={id} />
      </Suspense>
    </div>
  );
}
