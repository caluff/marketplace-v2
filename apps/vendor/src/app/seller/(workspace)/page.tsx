import type { VendorOnboardingResponse } from "@marketplace-v2/vendor-onboarding-contracts";
import type { HttpTypes } from "@mercurjs/types";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecentOrders } from "@/components/vendor/recent-orders";
import { DataError, PageHeading } from "@/features/workspace/components";
import { ORDER_LIST_FIELDS, resultOf, workspace } from "@/features/workspace/data";

export default async function DashboardPage() {
  const { client, membership } = await workspace();
  const [products, orders, inventory, setup] = await Promise.all([
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
  ]);
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
  const checks =
    setup.data?.checks.map((check) => ({
      label: checkLabels[check.key],
      href: checkLinks[check.key],
      complete: check.status === "complete",
      status: check.status,
      reason:
        check.reason === "inventory_not_configured"
          ? "Vincula artículos y existencias a una ubicación de tu tienda."
          : check.reason,
    })) ?? [];
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Tu operación"
        title={`Hola, ${membership.member.first_name || membership.seller.name}`}
        description="El estado actual de tu tienda, con datos de tu cuenta y acceso según tu rol."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardHeader>
              <CardTitle>{metric.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-display text-4xl">
                {metric.result.data?.count ?? "—"}
              </p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {metric.result.error ?? metric.note}
              </p>
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
          {orders.data ? (
            <RecentOrders orders={orders.data.orders} />
          ) : (
            <CardContent>
              <p role="alert" className="text-sm text-muted-foreground">
                {orders.error}
              </p>
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preparación de la tienda</CardTitle>
          </CardHeader>
          <CardContent>
            {setup.error ? (
              <p className="text-sm text-muted-foreground">
                No se pudo verificar la preparación de la tienda.
              </p>
            ) : null}
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
          </CardContent>
        </Card>
      </div>
      {setup.error ? <DataError message={setup.error} /> : null}
      <p className="text-xs leading-6 text-muted-foreground">
        Envíos, pagos, liquidaciones y comisiones requieren configuración
        adicional del operador.
      </p>
    </div>
  );
}
