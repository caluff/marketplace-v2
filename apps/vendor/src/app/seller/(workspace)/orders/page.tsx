import type { Metadata } from "next";
import type { HttpTypes } from "@mercurjs/types";
import Link from "next/link";
import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RecentOrders } from "@/components/vendor/recent-orders";
import {
  DataError,
  PageHeading,
  Pagination,
  SearchForm,
} from "@/features/workspace/components";
import {
  ORDER_LIST_FIELDS,
  resultOf,
  workspace,
} from "@/features/workspace/data";
import { ORDER_TABS, orderListInput } from "@/features/orders/parameters";

export const metadata: Metadata = { title: "Pedidos" };
async function OrderList({
  input,
}: {
  input: ReturnType<typeof orderListInput>;
}) {
  const { client } = await workspace();
  const result = await resultOf(
    client.get<HttpTypes.VendorOrderListResponse>("/vendor/orders", {
      q: input.q || undefined,
      offset: input.offset,
      limit: input.limit,
      order: "-created_at",
      fields: ORDER_LIST_FIELDS,
      ...input.tab.filters,
    }),
  );
  return result.data ? (
    <Card>
      <RecentOrders
        orders={result.data.orders}
        filtered={input.tab.value !== "all" || Boolean(input.q)}
      />
      <Pagination
        path="/seller/orders"
        page={input.page}
        count={result.data.count}
        q={input.q}
        filters={{ tab: input.tab.value }}
      />
    </Card>
  ) : (
    <DataError message={result.error} />
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; tab?: string }>;
}) {
  const input = orderListInput(await searchParams);
  return (
    <div className="space-y-6">
      <PageHeading title="Pedidos de la tienda" />
      <nav
        aria-label="Filtrar pedidos por estado"
        className="flex gap-1 overflow-x-auto border-b pb-1"
      >
        {ORDER_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/seller/orders?${new URLSearchParams({ tab: tab.value, ...(input.q ? { q: input.q } : {}) })}`}
            aria-current={input.tab.value === tab.value ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-3 text-sm font-medium ${input.tab.value === tab.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <SearchForm
        key={`${input.q}:${input.tab.value}`}
        q={input.q}
        label="Buscar pedidos"
        hidden={{ tab: input.tab.value }}
      />
      <Suspense
        key={`${input.q}:${input.tab.value}:${input.page}`}
        fallback={
          <Skeleton className="h-72 w-full" aria-label="Cargando pedidos" />
        }
      >
        <OrderList input={input} />
      </Suspense>
    </div>
  );
}
