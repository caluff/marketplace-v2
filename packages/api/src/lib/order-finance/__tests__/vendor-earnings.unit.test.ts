import type { MedusaContainer } from "@medusajs/framework/types";
import { GET } from "../../../api/vendor/finance/earnings/route";
import { vendorEarningsQuerySchema } from "../contracts";
import { providerFinanceFactSchema } from "../provider-facts";
import {
  financeCaptureAllocationSchema,
  type FinanceReportingSources,
} from "../reporting-sources";
import { readVendorEarnings } from "../vendor-earnings";
import { readVendorFinanceReporting } from "../vendor-reporting-projection";
import type { ReportingReadRow } from "../../../modules/commerce-automation/vendor-finance-reporting";

const now = new Date("2026-10-08T18:00:00.000Z");
const capturedAt = "2026-10-08T12:00:00.000Z";
const query = vendorEarningsQuerySchema.parse({
  period: "today",
  mode: "test",
  currency_code: "usd",
  data_kind: "ordinary",
});

function row(
  id: string,
  options: { capturedAt?: string; refund?: number } = {},
): ReportingReadRow {
  const at = options.capturedAt ?? capturedAt;
  const sources: FinanceReportingSources = {
    facts: [],
    costs: [],
    capture_allocations: [
      financeCaptureAllocationSchema.parse({
        group_id: "group_own",
        order_id: id,
        seller_id: "seller_own",
        capture_fact_key: "capture",
        status: "confirmed",
        effective_at: at,
        effective_source: "stripe_event_created",
        effective_time_status: "verified",
        recorded_at: at,
        reconciled_at: at,
        currency_code: "usd",
        data_kind: "ordinary",
        original: null,
        captured_amount: 100,
        merchandise_collected: 90,
        commission_recognized: 10,
        seller_entitlement_recognized: 90,
        component_attribution: "original_snapshot",
      }),
    ],
    refund_adjustments: [],
    coverage: {
      complete: true,
      issues: [],
      lists: [],
      capture_events_scope: "stripe_retained_events_30_days",
    },
  };
  if (options.refund) {
    sources.facts.push(
      providerFinanceFactSchema.parse({
        key: `refund:${id}`,
        kind: "refund",
        provider: "stripe",
        mode: "test",
        account_id: "acct_platform",
        group_id: "group_own",
        operation_id: "refund_operation",
        order_id: id,
        seller_id: "seller_own",
        native_id: null,
        provider_id: "re_test",
        charge_id: "ch_test",
        payment_intent_id: null,
        transfer_id: null,
        destination_account_id: null,
        provider_operation_id: null,
        provider_order_id: null,
        amount_minor: options.refund * 100,
        currency_code: "usd",
        data_kind: "ordinary",
        component_attribution: "unallocated",
        effect_status: "confirmed",
        reconciliation_status: "matched",
        effective_at: capturedAt,
        effective_source: "stripe_object_created",
        provider_event_id: null,
        provider_created_at: capturedAt,
        balance_transaction_id: null,
        recorded_at: capturedAt,
        reconciled_at: capturedAt,
      }),
    );
    sources.refund_adjustments.push({
      fact_key: `refund:${id}`,
      operation_id: "refund_operation",
      operation_state: "complete",
      order_id: id,
      seller_id: "seller_own",
      amount: options.refund,
      seller_entitlement_reduced: options.refund * 0.9,
      commission_returned: options.refund * 0.1,
      currency_code: "usd",
      component_attribution: "unallocated",
    });
  }
  return {
    id,
    seller_id: "seller_own",
    group_id: "group_own",
    cart_id: "cart_own",
    native_revision: "native",
    order_display_id: 12,
    order_custom_display_id: "PED-000000012",
    source_revision: "source",
    invalidation_token: null,
    unsafe: false,
    is_fresh: true,
    refreshed_at: capturedAt,
    sources,
  };
}

function fixture(rows: ReportingReadRow[]) {
  const readVendorFinanceReportingRegistry = jest.fn().mockResolvedValue({
    rows,
    discovery: { complete: true, cursor: null },
    truncated: false,
  });
  const container = {
    resolve: jest.fn().mockReturnValue({ readVendorFinanceReportingRegistry }),
  } as unknown as MedusaContainer;
  const input = {
    actor_id: "member_own",
    seller_id: "seller_own",
    query,
    generated_at: now,
  };
  return { container, input, readVendorFinanceReportingRegistry };
}

it("reconciles captured and refunded sales with Tus ganancias without requiring a transfer", async () => {
  const { container, input, readVendorFinanceReportingRegistry } = fixture([
    row("order_current", { refund: 20 }),
  ]);
  const { earnings } = await readVendorEarnings(container, input);
  const { report } = await readVendorFinanceReporting(container, input);
  expect(earnings.items[0]).toMatchObject({
    captured_amount: 100,
    refunded_amount: 20,
    total_amount: 80,
    commission_amount: 8,
    net_amount: 72,
  });
  expect(earnings.total_net).toBe(report.totals.vendor_earnings);
  expect(earnings.total_amount).toBe(80);
  expect(earnings.total_commission).toBe(8);
  expect(readVendorFinanceReportingRegistry).toHaveBeenCalledWith({
    seller_id: "seller_own",
    now,
  });
});

it("keeps negative period adjustments for earlier purchases and zero fully refunded purchases", async () => {
  const { container, input } = fixture([
    row("order_previous", {
      capturedAt: "2026-10-01T12:00:00.000Z",
      refund: 20,
    }),
    row("order_full", { refund: 100 }),
  ]);
  const { earnings } = await readVendorEarnings(container, input);
  expect(earnings.count).toBe(2);
  expect(
    earnings.items.find((item) => item.order_id === "order_previous"),
  ).toMatchObject({
    total_amount: -20,
    commission_amount: -2,
    net_amount: -18,
  });
  expect(
    earnings.items.find((item) => item.order_id === "order_full"),
  ).toMatchObject({ total_amount: 0, commission_amount: 0, net_amount: 0 });
  expect(earnings.total_net).toBe(-18);
});

it("excludes authorized orders, older sales without period movements and QA fixtures", async () => {
  const authorized = row("order_authorized");
  const qa = row("order_qa");
  (
    authorized.sources as FinanceReportingSources
  ).capture_allocations[0].status = "not_captured";
  (qa.sources as FinanceReportingSources).capture_allocations[0].data_kind =
    "qa_fixture";
  const { container, input } = fixture([
    authorized,
    qa,
    row("order_old", { capturedAt: "2026-10-01T12:00:00.000Z" }),
  ]);
  expect((await readVendorEarnings(container, input)).earnings.items).toEqual(
    [],
  );
});

it("paginates deterministically after qualifying sales, keeping totals independent of page", async () => {
  const { container, input } = fixture([
    row("order_b"),
    row("order_a"),
    row("order_c"),
  ]);
  const { earnings } = await readVendorEarnings(container, {
    ...input,
    query: { ...query, limit: 1, offset: 1 },
  });
  expect(earnings.items.map((item) => item.order_id)).toEqual(["order_b"]);
  expect(earnings.count).toBe(3);
  expect(earnings.total_net).toBe(270);
});

it("includes a verified commission adjustment even without captured or refunded principal in the period", async () => {
  const adjustment = row("order_adjustment", {
    capturedAt: "2026-10-01T12:00:00.000Z",
    refund: 20,
  });
  const sources = adjustment.sources as FinanceReportingSources;
  sources.facts[0].amount_minor = 0;
  sources.refund_adjustments[0].amount = 0;
  const { container, input } = fixture([adjustment]);
  const { earnings } = await readVendorEarnings(container, input);
  expect(earnings.items[0]).toMatchObject({
    total_amount: 0,
    commission_amount: -2,
    net_amount: -18,
  });
  expect(earnings.total_net).toBe(-18);
});

it("does not present partially verified row balances as final amounts", async () => {
  const partial = row("order_partial");
  const sources = partial.sources as FinanceReportingSources;
  sources.coverage = {
    ...sources.coverage,
    complete: false,
    issues: [{ resource: partial.id, reason: "refund_attribution_unverified" }],
  };
  const { container, input } = fixture([partial]);
  const { earnings } = await readVendorEarnings(container, input);
  expect(earnings.items[0]).toMatchObject({
    total_amount: null,
    commission_amount: null,
    net_amount: null,
    coverage: "partial",
  });
  expect(earnings.coverage.complete).toBe(false);
});

it("rejects foreign or stale projections without exposing their amounts or identities", async () => {
  const foreign = row("order_foreign");
  foreign.seller_id = "seller_other";
  const stale = row("order_stale");
  stale.is_fresh = false;
  const { container, input } = fixture([foreign, stale]);
  const { earnings } = await readVendorEarnings(container, input);
  expect(earnings.items).toEqual([]);
  expect(earnings.total_net).toBeNull();
  expect(earnings.coverage.complete).toBe(false);
});

it("requires an actor and selected seller, and rejects user-supplied seller filters", async () => {
  const { container, input } = fixture([]);
  await expect(
    readVendorEarnings(container, { ...input, actor_id: "" }),
  ).rejects.toThrow("Debes iniciar sesión");
  await expect(
    readVendorEarnings(container, { ...input, seller_id: "" }),
  ).rejects.toThrow("Selecciona una tienda");
  expect(
    vendorEarningsQuerySchema.safeParse({ ...query, seller_id: "seller_other" })
      .success,
  ).toBe(false);
  expect(
    vendorEarningsQuerySchema.safeParse({ ...query, mode: "live" }).success,
  ).toBe(false);
  expect(
    vendorEarningsQuerySchema.safeParse({ ...query, limit: 51 }).success,
  ).toBe(false);
});

it("uses only authenticated member and selected seller context at the HTTP boundary", async () => {
  const { container } = fixture([row("order_own")]);
  const json = jest.fn();
  const setHeader = jest.fn();
  await GET(
    {
      scope: container,
      auth_context: { actor_id: "member_own" },
      seller_context: { seller_id: "seller_own" },
      validatedQuery: query,
      query: { ...query, seller_id: "seller_other" },
    } as unknown as Parameters<typeof GET>[0],
    { json, setHeader } as unknown as Parameters<typeof GET>[1],
  );
  expect(setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  expect(json).toHaveBeenCalledWith(
    expect.objectContaining({
      earnings: expect.objectContaining({ filters: queryWithoutPagination() }),
    }),
  );
});

function queryWithoutPagination() {
  const { limit: _limit, offset: _offset, ...filters } = query;
  return filters;
}
