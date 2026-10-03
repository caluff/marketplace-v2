import type {
  FinanceReportingPeriod,
  FinanceReportingResponse,
} from "@marketplace-v2/api/finance-contracts";
import { intlFormat } from "date-fns/intlFormat";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";
import { Fragment } from "react";
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
import { workspace } from "@/features/workspace/data";

const primaryMetrics = {
  net_captured_volume: "Ventas netas",
  vendor_earnings: "Tus ganancias",
  transfers_net: "Transferido en el período",
  pending_settlement: "Pendiente de recibir",
} as const;
const activityMetrics = {
  paid_vendor_orders: "Pedidos pagados",
  refunds_effective: "Reembolsos",
} as const;
const collectionMetrics = {
  captured_volume: "Capturado antes de reembolsos",
  merchandise_gmv: "Ventas de mercancía sin envío",
} as const;
const reasonLabels: Record<string, string> = {
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
    const { client } = await workspace();
    ({ report } = await client.get<FinanceReportingResponse>(
      "/vendor/finance/reporting",
      {
        period,
        mode: "test",
        currency_code: "usd",
        data_kind: dataKind,
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
            href={`/seller?period=${period}&data_kind=${dataKind}&page=${page}`}
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
  return (
    <div className="space-y-4">
      {!report.coverage.complete ? (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          <p>
            Informe parcial. Los movimientos sin fecha efectiva o clasificación
            verificada se excluyen.
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
              {key === "net_captured_volume" || key === "pending_settlement" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {key === "net_captured_volume"
                    ? "Cobros menos reembolsos; incluye envío."
                    : "Saldo acumulado al corte."}
                </p>
              ) : null}
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
          Desglose de cobros
        </summary>
        <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          {(
            Object.entries(collectionMetrics) as Array<
              [keyof typeof collectionMetrics, string]
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
          Movimientos con fecha efectiva dentro del período; transferencias
          netas y saldos al corte.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Pedido</TableHead>
            <TableHead>Venta original</TableHead>
            <TableHead>Capturado período</TableHead>
            <TableHead>GMV período</TableHead>
            <TableHead>Reembolso período</TableHead>
            <TableHead>Tus ganancias período</TableHead>
            <TableHead>Transferido período</TableHead>
            <TableHead>Transferido al corte</TableHead>
            <TableHead>Saldo al corte</TableHead>
            <TableHead>Cobertura</TableHead>
            <TableHead>Capturado el</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.length ? (
            sales.map((sale) => (
              <Fragment key={sale.order_id}>
                <TableRow>
                  <TableCell>
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/seller/orders/${sale.order_id}`}
                    >
                      {sale.order_id}
                    </Link>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-primary">
                        Ver desglose
                      </summary>
                      <dl className="mt-2 space-y-1 text-xs">
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
                            Comisión neta período
                          </dt>
                          <dd>
                            {sale.net_commission === null
                              ? "—"
                              : money.format(sale.net_commission)}
                          </dd>
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
                      </dl>
                    </details>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {sale.captured_amount === null
                      ? "—"
                      : money.format(sale.captured_amount)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {money.format(sale.captured_in_period)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {money.format(sale.merchandise_collected_in_period)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {money.format(sale.refunds_effective)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {sale.seller_earnings === null
                      ? "—"
                      : money.format(sale.seller_earnings)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {money.format(sale.transferred_net)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {money.format(sale.transferred_net_to_cutoff)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {sale.pending_settlement === null
                      ? "—"
                      : money.format(sale.pending_settlement)}
                  </TableCell>
                  <TableCell>
                    {sale.coverage === "complete" ? "Completa" : "Parcial"}
                  </TableCell>
                  <TableCell>{displayDate(sale.captured_at)}</TableCell>
                </TableRow>
              </Fragment>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={11}
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
                  href={`/seller?period=${period}&data_kind=${dataKind}&page=${currentPage - 1}`}
                >
                  Anterior
                </Link>
              </Button>
            ) : null}
            {currentPage < lastPage ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/seller?period=${period}&data_kind=${dataKind}&page=${currentPage + 1}`}
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
