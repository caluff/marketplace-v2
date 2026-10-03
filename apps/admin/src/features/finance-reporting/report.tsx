import type {
  FinanceReportingPeriod,
  FinanceReportingResponse,
} from "@marketplace-v2/api/finance-contracts";
import { intlFormat } from "date-fns/intlFormat";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";
import { Fragment, Suspense } from "react";
import { formatOrderNumber } from "@marketplace-v2/order-reference";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { Skeleton } from "@/components/ui/skeleton";
import {
  loadReportOrderImages,
  ReportOrderImages,
} from "@/features/orders/order-images";

const primaryMetrics = {
  merchandise_gmv: "Ventas de mercancía",
  net_marketplace_commission: "Ingresos por comisiones",
  result_after_fees: "Resultado después de tarifas",
  pending_settlement: "Pendiente de liquidar",
} as const;
const activityMetrics = {
  paid_vendor_orders: "Pedidos pagados",
  refunds_effective: "Reembolsos",
} as const;
const reconciliationMetrics = {
  captured_volume: "Capturado en el período",
  net_captured_volume: "Capturado neto",
  gross_marketplace_commission: "Comisión bruta reconocida",
  commission_reversed: "Comisión revertida",
  transfers_gross: "Transferencias brutas del período",
  transfer_reversals: "Reversiones de transferencias",
  transfers_net: "Transferencias netas del período",
  confirmed_stripe_fees: "Tarifas Stripe confirmadas",
} as const;
const reasonLabels: Record<string, string> = {
  provider_fee_pending_or_unavailable: "Faltan tarifas de Stripe confirmadas.",
  provider_fee_time_unknown:
    "No se conoce la fecha efectiva de algunas tarifas.",
  provider_fact_unconfirmed:
    "Hay movimientos del proveedor pendientes de conciliación.",
  effective_time_unknown: "Hay movimientos sin fecha efectiva verificable.",
  capture_time_unknown: "No se pudo verificar la fecha de algunas capturas.",
  data_kind_unknown: "Hay movimientos históricos sin clasificación.",
  sales_source_limit_reached:
    "El informe alcanzó el límite de grupos consultados.",
  provider_observation_missing: "Falta una observación financiera de origen.",
  provider_observation_stale:
    "La observación financiera necesita actualizarse.",
  provider_context_revision_stale:
    "Los datos cambiaron después de su conciliación.",
  stored_cost_missing: "Faltan tarifas almacenadas de Stripe.",
};
const money = new Intl.NumberFormat("es-UY", {
  style: "currency",
  currency: "USD",
});
const PAGE_SIZE = 25;

function displayMoney(value: number | null) {
  return value === null ? "—" : money.format(value);
}

function displayDate(value: string | null) {
  if (!value) return "—";
  const date = parseISO(value);
  return isValid(date)
    ? intlFormat(
        date,
        {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "America/Montevideo",
        },
        { locale: "es-UY" },
      )
    : "—";
}

export async function FinanceReport({
  period,
  dataKind,
  page,
}: {
  period: FinanceReportingPeriod;
  dataKind: "ordinary" | "qa_fixture";
  page: number;
}) {
  let report: FinanceReportingResponse["report"];
  try {
    const sdk = await requireAdminSdk();
    ({ report } = await sdk.client.fetch<FinanceReportingResponse>(
      "/admin/finance/reporting",
      {
        query: {
          period,
          mode: "test",
          currency_code: "usd",
          data_kind: dataKind,
        },
        cache: "no-store",
      },
    ));
  } catch (error) {
    unstable_rethrow(error);
    return (
      <div className="flex flex-wrap items-center gap-3" role="alert">
        <p className="text-sm text-destructive">
          No se pudo cargar el informe financiero.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link
            href={`/dashboard?period=${period}&data_kind=${dataKind}&page=${page}`}
          >
            Reintentar
          </Link>
        </Button>
      </div>
    );
  }

  const lastPage = Math.max(1, Math.ceil(report.sales.length / PAGE_SIZE));
  const currentPage = Math.min(page, lastPage);
  const sales = report.sales.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const orderImages = sales.length
    ? loadReportOrderImages(sales.map((sale) => sale.order_id))
    : Promise.resolve(null);
  return (
    <div className="space-y-4">
      {!report.coverage.complete ? (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          <p>
            Informe parcial. El resultado después de tarifas requiere cobertura
            completa.
          </p>
          {report.coverage.partial_reasons.length ? (
            <ul className="mt-2 list-inside list-disc">
              {report.coverage.partial_reasons.map(({ reason, count }) => (
                <li key={reason}>
                  {reasonLabels[reason] ??
                    "Algunos datos no se pudieron verificar."}{" "}
                  ({count})
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div
        role="group"
        aria-label="Resumen financiero"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {(
          Object.entries(primaryMetrics) as Array<
            [keyof typeof primaryMetrics, string]
          >
        ).map(([key, label]) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle asChild className="text-sm font-medium">
                <h3>{label}</h3>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {displayMoney(report.totals[key])}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {key === "merchandise_gmv"
                  ? "No incluye envío."
                  : key === "net_marketplace_commission"
                    ? "Después de reembolsos."
                    : key === "result_after_fees"
                      ? report.totals[key] === null
                        ? "Pendiente de confirmar datos."
                        : "Después de tarifas de Stripe."
                      : "Saldo acumulado al corte."}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3 border-y py-3 text-sm">
        {(
          Object.entries(activityMetrics) as Array<
            [keyof typeof activityMetrics, string]
          >
        ).map(([key, label]) => (
          <div key={key} className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">
              {key === "paid_vendor_orders"
                ? report.totals[key].toLocaleString("es-UY")
                : displayMoney(report.totals[key])}
            </dd>
          </div>
        ))}
      </dl>
      <details className="border-b pb-3">
        <summary className="w-fit cursor-pointer rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          Desglose para conciliación
        </summary>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
          {(
            Object.entries(reconciliationMetrics) as Array<
              [keyof typeof reconciliationMetrics, string]
            >
          ).map(([key, label]) => (
            <div key={key}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {displayMoney(report.totals[key])}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <p className="text-xs text-muted-foreground">
        Pruebas · USD · {displayDate(report.window.start_at)} –{" "}
        {displayDate(report.window.end_at)} · zona {report.window.time_zone}
      </p>
      <Table>
        <TableCaption>
          Movimientos con fecha efectiva dentro del período; saldos acumulados
          al corte.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Imágenes</TableHead>
            <TableHead>Pedido</TableHead>
            <TableHead>Ventas de mercancía</TableHead>
            <TableHead>Reembolsos</TableHead>
            <TableHead>Comisiones netas</TableHead>
            <TableHead>Pendiente de liquidar</TableHead>
            <TableHead>Estado de datos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.length ? (
            sales.map((sale) => (
              <Fragment key={sale.order_id}>
                <TableRow>
                  <TableCell>
                    <Suspense
                      fallback={<Skeleton className="h-12 w-40 rounded-md" />}
                    >
                      <ReportOrderImages
                        id={sale.order_id}
                        data={orderImages}
                      />
                    </Suspense>
                  </TableCell>
                  <TableCell>
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/dashboard/orders/${sale.order_id}`}
                    >
                      {formatOrderNumber({
                        display_id: sale.order_display_id ?? undefined,
                        custom_display_id:
                          sale.order_custom_display_id ?? undefined,
                      })}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {money.format(sale.merchandise_collected_in_period)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {money.format(sale.refunds_effective)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {displayMoney(sale.net_commission)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {sale.pending_settlement === null
                      ? "—"
                      : money.format(sale.pending_settlement)}
                  </TableCell>
                  <TableCell>
                    {sale.coverage === "complete" ? "Completa" : "Parcial"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={7}>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-primary">
                        Ver desglose de{" "}
                        {formatOrderNumber({
                          display_id: sale.order_display_id ?? undefined,
                          custom_display_id:
                            sale.order_custom_display_id ?? undefined,
                        })}
                      </summary>
                      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <dt className="text-muted-foreground">
                            Venta original capturada
                          </dt>
                          <dd>{displayMoney(sale.captured_amount)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Capturado en el período
                          </dt>
                          <dd>{money.format(sale.captured_in_period)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Transferencias netas del período
                          </dt>
                          <dd>{money.format(sale.transferred_net)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Comisión bruta acumulada
                          </dt>
                          <dd>
                            {sale.gross_commission === null
                              ? "—"
                              : money.format(sale.gross_commission)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Comisión reconocida período
                          </dt>
                          <dd>
                            {money.format(sale.commission_recognized_in_period)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Comisión revertida período
                          </dt>
                          <dd>{money.format(sale.commission_reversed)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Transferencias brutas período
                          </dt>
                          <dd>{money.format(sale.transfers_gross)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Reversiones período
                          </dt>
                          <dd>{money.format(sale.transfer_reversals)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Transferencias brutas al corte
                          </dt>
                          <dd>
                            {money.format(sale.transfers_gross_to_cutoff)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Reversiones al corte
                          </dt>
                          <dd>
                            {money.format(sale.transfer_reversals_to_cutoff)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Transferencias netas al corte
                          </dt>
                          <dd>
                            {money.format(sale.transferred_net_to_cutoff)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            Capturado el
                          </dt>
                          <dd>{displayDate(sale.captured_at)}</dd>
                        </div>
                      </dl>
                    </details>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={7}
                className="py-8 text-center text-muted-foreground"
              >
                No hay ventas o reembolsos con movimientos en este período.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {report.sales.length > PAGE_SIZE ? (
        <nav
          className="flex items-center justify-between"
          aria-label="Paginación de pedidos"
        >
          <p className="text-sm text-muted-foreground">
            Página {currentPage} de {lastPage} · {report.sales.length} pedidos
          </p>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/dashboard?period=${period}&data_kind=${dataKind}&page=${currentPage - 1}`}
                >
                  Anterior
                </Link>
              </Button>
            ) : null}
            {currentPage < lastPage ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/dashboard?period=${period}&data_kind=${dataKind}&page=${currentPage + 1}`}
                >
                  Siguiente
                </Link>
              </Button>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
