import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Layers3, Store } from "lucide-react";

import { DemoBanner } from "@/components/admin/demo-banner";
import { OperationalEmptyState } from "@/components/admin/empty-state";
import { MetricCard } from "@/components/admin/metric-card";
import { ReviewQueueTable } from "@/components/admin/review-queue-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  demoMetrics,
  demoRequestMix,
  DEMO_SOURCE_LABEL,
} from "@/lib/demo-data";

export const metadata: Metadata = {
  title: "Resumen | Marketplace Admin",
  description:
    "Vista de demostración del panel de operaciones del marketplace.",
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Operaciones</Badge>
            <span className="text-xs font-medium text-muted-foreground">
              Vista estática
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[1.75rem]">
            Panorama del marketplace
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-5 text-muted-foreground">
            Una lectura rápida de la cola de revisión, la salud del catálogo y
            las señales que necesitan atención del operador.
          </p>
        </div>
        <Badge variant="outline" className="w-fit font-mono uppercase">
          {DEMO_SOURCE_LABEL}
        </Badge>
      </section>

      <DemoBanner />

      <section aria-labelledby="metrics-title">
        <h2 id="metrics-title" className="sr-only">
          Indicadores de demostración
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {demoMetrics.map((metric) => (
            <MetricCard key={metric.id} {...metric} />
          ))}
        </div>
      </section>

      <section id="requests" className="scroll-mt-24">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-4 border-b border-border">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <CardTitle>Cola de revisión</CardTitle>
                <Badge variant="outline" className="text-[9px] uppercase">
                  Demo
                </Badge>
              </div>
              <CardDescription>
                Solicitudes sintéticas ordenadas por prioridad y antigüedad.
              </CardDescription>
            </div>
            <span className="hidden rounded-md bg-muted px-2 py-1 font-mono text-[10px] font-semibold text-muted-foreground sm:inline-flex">
              4 de 12 visibles
            </span>
          </CardHeader>
          <CardContent className="p-0">
            <ReviewQueueTable />
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card id="catalog" className="scroll-mt-24">
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <CardTitle>Composición de solicitudes</CardTitle>
                  <Badge variant="outline" className="text-[9px] uppercase">
                    Demo
                  </Badge>
                </div>
                <CardDescription>
                  Distribución visual del fixture de catálogo.
                </CardDescription>
              </div>
              <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Layers3 className="size-4" aria-hidden="true" />
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            {demoRequestMix.map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                  <span className="font-medium">{item.label}</span>
                  <span className="font-mono font-semibold text-muted-foreground">
                    {item.value}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/35 p-3">
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-success-foreground"
                aria-hidden="true"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Los porcentajes son de muestra y no se calculan desde datos del
                backend.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card id="stores" className="scroll-mt-24">
          <CardHeader className="border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="mb-1.5 flex items-center gap-2">
                  <CardTitle>Alertas operativas</CardTitle>
                  <Badge variant="outline" className="text-[9px] uppercase">
                    Demo
                  </Badge>
                </div>
                <CardDescription>
                  Espacio reservado para señales sobre tiendas y catálogo.
                </CardDescription>
              </div>
              <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Store className="size-4" aria-hidden="true" />
              </span>
            </div>
          </CardHeader>
          <OperationalEmptyState />
        </Card>
      </div>

      <section className="rounded-xl border border-border bg-foreground px-5 py-5 text-background shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-sm font-semibold">Shell de acceso disponible</p>
          <p className="mt-1 text-xs leading-5 text-background/65">
            La pantalla de login es solo visual; todavía no autentica usuarios.
          </p>
        </div>
        <Link
          href="/login"
          data-testid="view-login-shell"
          className="mt-4 inline-flex h-8 items-center gap-2 rounded-md bg-background px-3 text-xs font-semibold text-foreground outline-none transition-colors hover:bg-background/90 focus-visible:ring-2 focus-visible:ring-background/50 sm:mt-0"
        >
          Ver shell de login
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
