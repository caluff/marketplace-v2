"use client";

import type { FinanceReportingSale } from "@usapeek/api/finance-contracts";
import { formatOrderNumber } from "@usapeek/order-reference";
import { Fragment, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatReportDate, formatReportMoney } from "./presentation";

export function SaleBreakdown({ sale }: { sale: FinanceReportingSale }) {
  const commission = sale.net_commission;
  const rows = [
    { label: "Cobrado al cliente", value: sale.captured_in_period },
    ...(sale.refunds_effective > 0
      ? [{ label: "Reembolsado al cliente", value: -sale.refunds_effective }]
      : []),
    {
      label:
        commission !== null && commission < 0
          ? "Comisión devuelta"
          : "Comisión de la plataforma",
      value: commission === null ? null : commission === 0 ? 0 : -commission,
    },
  ];
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-xs text-muted-foreground">
        Movimientos del período seleccionado.
      </p>
      <dl className="space-y-3 text-sm">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-6">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="shrink-0 tabular-nums">
              {formatReportMoney(value)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-6 border-t pt-3 font-semibold">
          <dt>Para ti</dt>
          <dd className="shrink-0 tabular-nums">
            {formatReportMoney(sale.seller_earnings)}
          </dd>
        </div>
      </dl>
      {sale.transferred_net !== 0 ? (
        <p className="text-sm text-muted-foreground">
          {sale.transferred_net > 0
            ? "Transferido a tu cuenta"
            : "Transferencia revertida"}
          {": "}
          {formatReportMoney(Math.abs(sale.transferred_net))} en este período.
        </p>
      ) : null}
      <Link
        href={`/seller/orders/${sale.order_id}`}
        className="inline-flex text-sm font-medium text-primary hover:underline"
      >
        Ver pedido
      </Link>
    </div>
  );
}

export function FinanceSaleRow({
  sale,
  children,
}: {
  sale: FinanceReportingSale;
  children?: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailId = useId();
  const orderNumber = formatOrderNumber({
    display_id: sale.order_display_id ?? undefined,
    custom_display_id: sale.order_custom_display_id ?? undefined,
  });
  return (
    <Fragment>
      <TableRow className="grid grid-cols-2 sm:table-row">
        <TableCell className="col-span-2 block sm:table-cell">
          <div className="flex items-center gap-3">
            <div className="hidden shrink-0 sm:block">{children}</div>
            <div className="space-y-1">
              <Link
                className="whitespace-nowrap font-medium text-primary hover:underline"
                href={`/seller/orders/${sale.order_id}`}
              >
                {orderNumber}
              </Link>
              {sale.captured_at ? (
                <p className="text-xs text-muted-foreground">
                  Cobro: {formatReportDate(sale.captured_at)}
                </p>
              ) : null}
            </div>
          </div>
        </TableCell>
        <TableCell className="block tabular-nums sm:table-cell sm:text-right">
          <span className="mb-1 block text-xs text-muted-foreground sm:hidden">
            Cobrado al cliente
          </span>
          {formatReportMoney(sale.captured_in_period)}
        </TableCell>
        <TableCell className="block font-semibold tabular-nums sm:table-cell sm:text-right">
          <span className="mb-1 block text-xs font-normal text-muted-foreground sm:hidden">
            Para ti
          </span>
          {formatReportMoney(sale.seller_earnings)}
        </TableCell>
        <TableCell className="col-span-2 block sm:table-cell sm:text-right">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${isExpanded ? "Ocultar" : "Ver"} detalle de ${orderNumber}`}
            aria-expanded={isExpanded}
            aria-controls={detailId}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? "Ocultar" : "Ver detalle"}
          </Button>
        </TableCell>
      </TableRow>
      <TableRow
        hidden={!isExpanded}
        className={`bg-muted/30 hover:bg-muted/30 ${isExpanded ? "block sm:table-row" : "hidden"}`}
      >
        <TableCell colSpan={4} className="block p-5 sm:table-cell">
          <div
            id={detailId}
            role="region"
            aria-label={`Detalle de ${orderNumber}`}
          >
            {isExpanded ? <SaleBreakdown sale={sale} /> : null}
          </div>
        </TableCell>
      </TableRow>
    </Fragment>
  );
}
