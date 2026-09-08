import type { VendorOnboardingResponse } from "@marketplace-v2/vendor-onboarding-contracts";
import type { HttpTypes } from "@mercurjs/types";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecentOrders } from "@/components/vendor/recent-orders";
import { PageHeading } from "@/features/workspace/components";
import {
  ORDER_LIST_FIELDS,
  resultOf,
  workspace,
} from "@/features/workspace/data";

export default async function DashboardPage() {
  const { client, membership } = await workspace();
  const [products, orders, inventory, setup] = [
    resultOf(
      client.get<HttpTypes.VendorProductListResponse>("/vendor/products", {
        limit: 1,
        fields: "id",
      }),
    ),
    resultOf(
      client.get<HttpTypes.VendorOrderListResponse>("/vendor/orders", {
        limit: 5,
        order: "-created_at",
        fields: ORDER_LIST_FIELDS,
      }),
    ),
    resultOf(
      client.get<HttpTypes.VendorInventoryItemListResponse>(
        "/vendor/inventory-items",
        { limit: 1, fields: "id" },
      ),
    ),
    resultOf(client.get<VendorOnboardingResponse>("/vendor/onboarding")),
  ] as const;
  const metrics = [
    {
      title: "Catálogo disponible",
      result: products,
      href: "/seller/catalog",
      note: "Incluye productos compartidos",
    },
    {
      title: "Pedidos de la tienda",
      result: orders,
      href: "/seller/orders",
      note: "Total de pedidos asignados",
    },
    {
      title: "Artículos de inventario",
      result: inventory,
      href: "/seller/inventory",
      note: "Artículos vinculados a la tienda",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Tu operación"
        title={`Hola, ${membership.member.first_name || membership.seller.name}`}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardHeader>
              <CardTitle>{metric.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense
                fallback={
                  <div
                    role="status"
                    aria-label="Cargando total"
                    className="h-16 animate-pulse bg-muted"
                  />
                }
              >
                <MetricValue result={metric.result} note={metric.note} />
              </Suspense>
              <Link
                href={metric.href}
                className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
              >
                Consultar →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Pedidos recientes</CardTitle>
          </CardHeader>
          <Suspense
            fallback={
              <div
                role="status"
                aria-label="Cargando pedidos"
                className="h-64 animate-pulse bg-muted"
              />
            }
          >
            <OrderContent result={orders} />
          </Suspense>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preparación de la tienda</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense
              fallback={
                <div
                  role="status"
                  aria-label="Cargando preparación"
                  className="h-56 animate-pulse bg-muted"
                />
              }
            >
              <SetupContent result={setup} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function MetricValue({
  result,
  note,
}: {
  result: Promise<{ data?: { count: number }; error?: string }>;
  note: string;
}) {
  const metric = await result;
  return (
    <>
      <p className="font-display text-4xl">{metric.data?.count ?? "—"}</p>
      <p
        className="mt-2 text-xs leading-5 text-muted-foreground"
        role={metric.error ? "alert" : undefined}
      >
        {metric.error ?? note}
      </p>
    </>
  );
}

async function OrderContent({
  result,
}: {
  result: ReturnType<typeof resultOf<HttpTypes.VendorOrderListResponse>>;
}) {
  const orders = await result;
  return orders.data ? (
    <RecentOrders orders={orders.data.orders} />
  ) : (
    <CardContent>
      <p role="alert" className="text-sm text-muted-foreground">
        {orders.error}
      </p>
    </CardContent>
  );
}

async function SetupContent({
  result,
}: {
  result: ReturnType<typeof resultOf<VendorOnboardingResponse>>;
}) {
  const setup = await result;
  if (!setup.data)
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        {setup.error}
      </p>
    );
  const checkLabels = {
    profile: "Perfil de la tienda",
    location: "Ubicación de inventario",
    first_product: "Primer producto",
    inventory: "Inventario configurado",
  };
  const checkLinks = {
    profile: "/seller/settings",
    location: "/seller/inventory/locations",
    first_product: "/seller/catalog",
    inventory: "/seller/inventory",
  };
  const checks = setup.data.checks.map((check) => ({
    label: checkLabels[check.key],
    href: checkLinks[check.key],
    complete: check.status === "complete",
    status: check.status,
    reason:
      check.reason === "inventory_not_configured"
        ? "Vincula artículos y existencias a una ubicación de tu tienda."
        : check.reason,
  }));
  return (
    <ul className="space-y-4">
      {checks.map((check) => {
        const Icon = check.complete ? CheckCircle2 : Circle;
        return (
          <li key={check.label} className="flex items-start gap-3">
            <Icon
              className={`mt-0.5 size-4 shrink-0 ${check.complete ? "text-primary" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            <div>
              <Link
                href={check.href}
                className="text-sm font-semibold hover:underline"
              >
                {check.label}
              </Link>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {check.status === "blocked"
                  ? "Requiere configuración del operador"
                  : check.complete
                    ? "Completo"
                    : "Pendiente"}
              </p>
              {check.reason ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {check.reason}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
