import type Medusa from "@medusajs/js-sdk";
import type { HttpTypes } from "@mercurjs/types";
import type { AdminApplicationListResponse } from "@marketplace-v2/vendor-onboarding-contracts";

export const OVERVIEW_METRICS = [
  {
    id: "applications",
    label: "Solicitudes en revisión",
    href: "/dashboard/vendor-applications?status=submitted",
    action: "Revisar solicitudes",
  },
  {
    id: "products",
    label: "Productos propuestos",
    href: "/dashboard/product-review?status=proposed",
    action: "Revisar productos",
  },
  {
    id: "stores",
    label: "Tiendas",
    href: "/dashboard/stores",
    action: "Ver tiendas",
  },
  {
    id: "orders",
    label: "Pedidos",
    href: "/dashboard/orders",
    action: "Ver pedidos",
  },
] as const;

export type OverviewMetricDefinition = (typeof OVERVIEW_METRICS)[number];

export async function readOverviewCount(
  sdk: Medusa,
  id: OverviewMetricDefinition["id"],
) {
  const query = { limit: 1, offset: 0, fields: "id" };
  switch (id) {
    case "applications":
      return (
        await sdk.client.fetch<AdminApplicationListResponse>(
          "/admin/vendor-applications",
          {
            query: { limit: 1, offset: 0, status: "submitted" },
            cache: "no-store",
          },
        )
      ).count;
    case "products":
      return (await sdk.admin.product.list({ ...query, status: ["proposed"] }))
        .count;
    case "stores":
      return (
        await sdk.client.fetch<HttpTypes.AdminSellerListResponse>(
          "/admin/sellers",
          {
            query,
            cache: "no-store",
          },
        )
      ).count;
    case "orders":
      return (await sdk.admin.order.list(query)).count;
  }
}
