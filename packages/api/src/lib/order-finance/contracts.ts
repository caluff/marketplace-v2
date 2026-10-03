import { z } from "@medusajs/framework/zod";

export const FINANCE_REPORTING_PERIODS = [
  "today",
  "last_7_days",
  "last_30_days",
  "current_month",
] as const;

export type FinanceReportingPeriod = (typeof FINANCE_REPORTING_PERIODS)[number];

export const financeReportingQuerySchema = z
  .object({
    period: z.enum(FINANCE_REPORTING_PERIODS),
    mode: z.literal("test"),
    currency_code: z.literal("usd"),
    data_kind: z.enum(["ordinary", "qa_fixture"]),
  })
  .strict();

export type FinanceReportingQuery = z.infer<typeof financeReportingQuerySchema>;

export type FinanceReportingSale = {
  order_id: string;
  order_display_id: number | null;
  order_custom_display_id: string | null;
  capture_status: "confirmed" | "not_captured" | "unknown";
  captured_at: string | null;
  captured_amount: number | null;
  captured_in_period: number;
  merchandise_collected: number | null;
  merchandise_collected_in_period: number;
  refunds_effective: number;
  refund_component_attribution: "unallocated" | "unknown";
  gross_commission: number | null;
  commission_recognized_in_period: number;
  commission_reversed: number;
  net_commission: number | null;
  seller_earnings: number | null;
  transfers_gross: number;
  transfer_reversals: number;
  transferred_net: number;
  transfers_gross_to_cutoff: number;
  transfer_reversals_to_cutoff: number;
  transferred_net_to_cutoff: number;
  pending_settlement: number | null;
  coverage: "complete" | "partial";
};

export type FinanceReportingResponse = {
  report: {
    filters: FinanceReportingQuery;
    window: {
      time_zone: string;
      start_at: string;
      end_at: string;
      cutoff_at: string;
      generated_at: string;
    };
    totals: {
      captured_volume: number;
      merchandise_gmv: number;
      paid_vendor_orders: number;
      refunds_effective: number;
      net_captured_volume: number;
      gross_marketplace_commission: number;
      commission_reversed: number;
      net_marketplace_commission: number;
      result_after_fees: number | null;
      vendor_earnings: number;
      transfers_gross: number;
      transfer_reversals: number;
      transfers_net: number;
      pending_settlement: number;
      confirmed_stripe_fees: number | null;
    };
    coverage: {
      complete: boolean;
      partial_reasons: Array<{ reason: string; count: number }>;
      excluded_unknown_data_kind: number;
      excluded_unknown_effective_time: number;
      pending_or_unavailable_fees: number;
      sales_truncated: boolean;
    };
    sales: FinanceReportingSale[];
  };
};

export const orderFinanceInputSchema = z
  .object({
    action: z.enum(["cancel", "refund", "capture"]),
    amount: z.number().finite().positive().optional(),
    note: z.string().trim().min(3).max(500),
    request_id: z.uuid(),
    confirm: z.literal(true),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.action === "refund" && input.amount === undefined) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Indica el importe del reembolso.",
      });
    }
    if (input.action !== "refund" && input.amount !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "El importe de esta operación lo calcula el servidor.",
      });
    }
  });

export type OrderFinanceInput = z.infer<typeof orderFinanceInputSchema>;

export type OrderFinanceResponse = {
  finance: {
    order_id: string;
    currency_code: string;
    allocated_total: number;
    refunded_total: number;
    refundable_total: number;
    captured_total: number;
    capture: { allowed: boolean; reason: string | null; amount: number };
    cancellation: {
      allowed: boolean;
      reason: string | null;
      refund_amount: number;
    };
    refund: { allowed: boolean; reason: string | null };
    history: Array<{
      id: string;
      kind: "cancel" | "refund" | "capture";
      amount: number;
      status: "processing" | "complete" | "uncertain";
      note: string;
      created_at: string;
      seller_reversed?: number;
      seller_entitlement_reduced?: number;
      commission_returned?: number;
    }>;
  };
};
