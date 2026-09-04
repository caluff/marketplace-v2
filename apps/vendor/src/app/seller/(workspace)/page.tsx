import Link from "next/link";
import {
  ArrowUpRight,
  BellOff,
  Boxes,
  CircleDollarSign,
  PackageCheck,
  ShoppingBag,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DemoNotice } from "@/components/vendor/demo-notice";
import { EmptyState } from "@/components/vendor/empty-state";
import { MetricCard } from "@/components/vendor/metric-card";
import { RecentOrders } from "@/components/vendor/recent-orders";
import { demoMetrics, demoWeeklyActivity } from "@/lib/demo-data";

const metricIcons = [
  CircleDollarSign,
  ShoppingBag,
  PackageCheck,
  Boxes,
] as const;

export default function SellerDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary">Resumen diario</Badge>
            <span className="text-xs font-semibold text-muted-foreground">
              Viernes · muestra estática
            </span>
          </div>
          <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
            Tu tienda, de un vistazo.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Un panel sereno para priorizar pedidos, catálogo e inventario sin
            perder el hilo de la operación.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/seller/catalog">
            Ver catálogo demo
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <DemoNotice />

      <section aria-labelledby="metrics-title">
        <h2 id="metrics-title" className="sr-only">
          Métricas de demostración
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {demoMetrics.map((metric, index) => (
            <MetricCard
              key={metric.label}
              {...metric}
              icon={metricIcons[index]}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <RecentOrders />
        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-border/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Ritmo semanal</CardTitle>
                  <CardDescription>
                    Volumen relativo de pedidos ficticios.
                  </CardDescription>
                </div>
                <Badge variant="outline">Demo</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div
                className="flex h-40 items-end justify-between gap-2"
                aria-label="Gráfico de actividad semanal de demostración"
              >
                {demoWeeklyActivity.map((day) => (
                  <div
                    key={day.label}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                  >
                    <div className="flex h-full w-full items-end rounded-md bg-secondary/70 p-1">
                      <div
                        className="w-full rounded-[3px] bg-primary/80"
                        style={{ height: `${day.value}%` }}
                        title={`${day.label}: ${day.value}% de actividad ficticia`}
                      />
                    </div>
                    <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                      {day.label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <EmptyState
            compact
            eyebrow="Bandeja demo"
            title="Todo está tranquilo"
            description="No hay avisos en esta muestra. Los estados vacíos mantienen el contexto y evitan confundir una carga pendiente con ausencia de datos."
            icon={BellOff}
          />
        </div>
      </div>
    </div>
  );
}
