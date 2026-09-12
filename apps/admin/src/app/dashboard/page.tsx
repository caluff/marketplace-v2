import type { Metadata } from "next";
import { Suspense } from "react";
import {
  OverviewMetric,
  OverviewMetricSkeleton,
} from "@/features/overview/components";
import { OVERVIEW_METRICS } from "@/features/overview/metrics";

export const metadata: Metadata = { title: "Resumen | Marketplace Admin" };

export default function DashboardPage() {
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
    </div>
  );
}
