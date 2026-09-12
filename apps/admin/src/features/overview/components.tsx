import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { readOverviewCount, type OverviewMetricDefinition } from "./metrics";

export function OverviewMetricSkeleton({
  metric,
}: {
  metric: OverviewMetricDefinition;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{metric.label}</CardTitle>
      </CardHeader>
      <CardContent aria-label="Cargando indicador">
        <Skeleton className="mb-4 h-9 w-20" />
        <Skeleton className="h-5 w-36" />
      </CardContent>
    </Card>
  );
}

export async function OverviewMetric({
  metric,
}: {
  metric: OverviewMetricDefinition;
}) {
  const sdk = await requireAdminSdk();
  let count: number | null = null;
  try {
    count = await readOverviewCount(sdk, metric.id);
  } catch {
    /* Each metric remains independent when a service is unavailable. */
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{metric.label}</CardTitle>
      </CardHeader>
      <CardContent>
        {count === null ? (
          <p role="alert" className="mb-4 text-sm text-muted-foreground">
            No pudimos cargar este indicador.
          </p>
        ) : (
          <p className="mb-4 text-3xl font-semibold tabular-nums">
            {count.toLocaleString("es-UY")}
          </p>
        )}
        <Link
          href={metric.href}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          {metric.action}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  );
}
