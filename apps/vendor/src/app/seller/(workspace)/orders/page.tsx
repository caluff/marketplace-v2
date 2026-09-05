import type { Metadata } from "next";
import type { HttpTypes } from "@mercurjs/types";
import { Card } from "@/components/ui/card";
import { RecentOrders } from "@/components/vendor/recent-orders";
import {
  DataError,
  PageHeading,
  Pagination,
  SearchForm,
} from "@/features/workspace/components";
import { ORDER_LIST_FIELDS, resultOf, workspace } from "@/features/workspace/data";
import { listInput } from "@/features/workspace/presentation";

export const metadata: Metadata = { title: "Pedidos" };
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { client } = await workspace();
  const input = listInput(await searchParams);
  const result = await resultOf(
    client.get<HttpTypes.VendorOrderListResponse>("/vendor/orders", {
      q: input.q || undefined,
      offset: input.offset,
      limit: input.limit,
      order: "-created_at",
      fields: ORDER_LIST_FIELDS,
    }),
  );
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Pedidos"
        title="Pedidos de la tienda"
        description="Consulta los artículos, importes y estados de tus pedidos. La gestión de envíos, cancelaciones y reembolsos estará disponible cuando se configure la operación."
      />
      <SearchForm q={input.q} label="Buscar pedidos" />
      {result.data ? (
        <Card>
          <RecentOrders orders={result.data.orders} />
          <Pagination
            path="/seller/orders"
            page={input.page}
            count={result.data.count}
            q={input.q}
          />
        </Card>
      ) : (
        <DataError message={result.error} />
      )}
    </div>
  );
}
