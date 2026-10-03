import type { Metadata } from "next";
import { Suspense } from "react";
import {
  OverviewMetric,
  OverviewMetricSkeleton,
} from "@/features/overview/components";
import { OVERVIEW_METRICS } from "@/features/overview/metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { FinanceReport } from "@/features/finance-reporting/report";
import { Button } from "@/components/ui/button";
import type { FinanceReportingPeriod } from "@marketplace-v2/api/finance-contracts";

export const metadata: Metadata = { title: "Resumen | Marketplace Admin" };

const periods = [
  "today",
  "last_7_days",
  "last_30_days",
  "current_month",
] as const;
const periodLabels = ["Hoy", "Últimos 7 días", "Últimos 30 días", "Mes actual"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; data_kind?: string; page?: string }>;
}) {
  const search = await searchParams;
  const period: FinanceReportingPeriod = periods.includes(
    search.period as (typeof periods)[number],
  )
    ? (search.period as FinanceReportingPeriod)
    : "last_30_days";
  const dataKind =
    search.data_kind === "qa_fixture" ? "qa_fixture" : "ordinary";
  const page =
    search.page && /^\d+$/.test(search.page)
      ? Math.max(1, Math.min(Number(search.page), 100_000))
      : 1;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Panorama del marketplace
      </h1>
      <section
        aria-label="Indicadores del marketplace"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {OVERVIEW_METRICS.map((metric) => (
          <Suspense
            key={metric.id}
            fallback={<OverviewMetricSkeleton metric={metric} />}
          >
            <OverviewMetric metric={metric} />
          </Suspense>
        ))}
      </section>
      <section className="space-y-4" aria-labelledby="finance-report-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="finance-report-title" className="text-xl font-semibold">
            Informe financiero
          </h2>
          <form className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm" htmlFor="finance-period">
              Período
              <NativeSelect
                id="finance-period"
                name="period"
                defaultValue={period}
              >
                {periods.map((value, index) => (
                  <NativeSelectOption key={value} value={value}>
                    {periodLabels[index]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1 text-sm" htmlFor="finance-kind">
              Datos
              <NativeSelect
                id="finance-kind"
                name="data_kind"
                defaultValue={dataKind}
              >
                <NativeSelectOption value="ordinary">
                  Operación normal
                </NativeSelectOption>
                <NativeSelectOption value="qa_fixture">
                  Fixtures QA
                </NativeSelectOption>
              </NativeSelect>
            </label>
            <Button variant="outline" type="submit">
              Aplicar
            </Button>
          </form>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Pruebas · USD</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense
              fallback={
                <p role="status" className="text-sm text-muted-foreground">
                  Cargando informe…
                </p>
              }
            >
              <FinanceReport period={period} dataKind={dataKind} page={page} />
            </Suspense>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
