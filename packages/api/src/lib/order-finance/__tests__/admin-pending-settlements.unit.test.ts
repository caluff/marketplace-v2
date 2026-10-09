import assert from "node:assert/strict";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../../../modules/commerce-automation";
import type { AdminReportingReadRow } from "../../../modules/commerce-automation/admin-finance-reporting";
import {
  groupPendingSettlements,
  readAdminReportingProjection,
} from "../admin-reporting-projection";
import type {
  AdminFinanceReportingResponse,
  FinanceReportingQuery,
  FinanceReportingSale,
} from "../contracts";
import type { ProviderFinanceFact } from "../provider-facts";
import { aggregateFinanceReporting } from "../reporting";
import { resolveFinanceReportingWindow } from "../reporting-period";
import type {
  FinanceCaptureAllocation,
  FinanceReportingSources,
} from "../reporting-sources";

const generatedAt = new Date("2026-10-06T15:00:00.000Z");
const filters: FinanceReportingQuery = {
  period: "today",
  mode: "test",
  currency_code: "usd",
  data_kind: "ordinary",
};
const window = resolveFinanceReportingWindow(filters.period, generatedAt);

function allocation(
  orderId: string,
  sellerId: string,
  amount: number,
  changes: Partial<FinanceCaptureAllocation> = {},
): FinanceCaptureAllocation {
  return {
    group_id: "group_test",
    order_id: orderId,
    seller_id: sellerId,
    capture_fact_key: null,
    status: "confirmed",
    effective_at: "2026-10-06T12:00:00.000Z",
    effective_source: "stripe_event_created",
    effective_time_status: "verified",
    recorded_at: "2026-10-06T12:00:00.000Z",
    reconciled_at: "2026-10-06T12:00:00.000Z",
    currency_code: "usd",
    data_kind: "ordinary",
    original: null,
    captured_amount: amount,
    merchandise_collected: amount,
    commission_recognized: 0,
    seller_entitlement_recognized: amount,
    component_attribution: "unknown",
    ...changes,
  };
}

function source(
  allocations: FinanceCaptureAllocation[],
  changes: Partial<FinanceReportingSources> = {},
): FinanceReportingSources {
  return {
    facts: [],
    costs: [],
    capture_allocations: allocations,
    refund_adjustments: [],
    coverage: {
      complete: true,
      issues: [],
      lists: [],
      capture_events_scope: "stripe_retained_events_30_days",
    },
    ...changes,
  };
}

function row(sources: FinanceReportingSources): AdminReportingReadRow {
  return {
    id: "group_test",
    cart_id: "cart_test",
    references: sources.capture_allocations.map((part) => ({
      id: part.order_id,
      seller_id: part.seller_id,
      native_revision: "native_test",
      order_display_id: 1,
      order_custom_display_id: null,
    })),
    source_revision: "verified_test",
    invalidation_token: null,
    unsafe: false,
    is_fresh: true,
    refreshed_at: generatedAt.toISOString(),
    sources,
  };
}

const baseSale = aggregateFinanceReporting(filters, window, [
  source([allocation("order_base", "seller_base", 1)]),
]).report.sales[0];

function report(
  sales: Array<Pick<FinanceReportingSale, "order_id" | "pending_settlement">>,
  total: number | null,
): Pick<
  AdminFinanceReportingResponse["report"],
  "totals" | "sales" | "coverage"
> {
  const empty = aggregateFinanceReporting(filters, window, []);
  return {
    ...empty.report,
    totals: { ...empty.report.totals, pending_settlement: total },
    sales: sales.map((sale) => ({ ...baseSale, ...sale })),
  };
}

function references(entries: Array<[string, string]>) {
  return new Map(
    entries.map(([id, seller_id]) => [
      id,
      {
        id,
        seller_id,
        native_revision: "verified_test",
        order_display_id: null,
        order_custom_display_id: null,
      },
    ]),
  );
}

function container(
  rows: AdminReportingReadRow[],
  graph: (input: unknown, options: unknown) => Promise<unknown>,
  complete = true,
): MedusaContainer {
  return {
    resolve(key: string) {
      if (key === COMMERCE_AUTOMATION_MODULE)
        return {
          readAdminFinanceReportingRegistry: async () => ({
            rows,
            discovery: { cursor: null, complete },
            truncated: false,
          }),
        };
      if (key === ContainerRegistrationKeys.QUERY) return { graph };
      throw new Error(`Unexpected service ${key}`);
    },
  } as unknown as MedusaContainer;
}

test("nets every sale per store with exact display-unit decimals and keeps negative store balances", () => {
  const result = groupPendingSettlements(
    report(
      [
        { order_id: "order_a", pending_settlement: 0.1 },
        { order_id: "order_b", pending_settlement: 0.2 },
        { order_id: "order_c", pending_settlement: -0.05 },
        { order_id: "order_d", pending_settlement: -0.1 },
        { order_id: "order_e", pending_settlement: 0.2 },
        { order_id: "order_f", pending_settlement: -0.2 },
      ],
      0.15,
    ),
    references([
      ["order_a", "seller_one"],
      ["order_b", "seller_one"],
      ["order_c", "seller_one"],
      ["order_d", "seller_two"],
      ["order_e", "seller_settled"],
      ["order_f", "seller_settled"],
    ]),
  );
  assert.deepEqual(result, {
    stores: [
      { seller_id: "seller_one", seller_name: null, amount: 0.25 },
      { seller_id: "seller_two", seller_name: null, amount: -0.1 },
    ],
    complete: true,
  });
});

test("keeps reconciled known balances while flagging historical unknown sales as partial", () => {
  const result = groupPendingSettlements(
    report(
      [
        { order_id: "order_known", pending_settlement: 204 },
        { order_id: "order_unknown", pending_settlement: null },
      ],
      204,
    ),
    references([["order_known", "seller_known"]]),
  );
  assert.deepEqual(result, {
    stores: [{ seller_id: "seller_known", seller_name: null, amount: 204 }],
    complete: false,
  });
  assert.equal(
    groupPendingSettlements(
      report([{ order_id: "order_known", pending_settlement: 204 }], null),
      references([["order_known", "seller_known"]]),
    ),
    null,
  );
});

test("rejects missing attribution, duplicate orders and a total that cannot reconcile", () => {
  const sales = [{ order_id: "order_known", pending_settlement: 10 }];
  const refs = references([["order_known", "seller_known"]]);
  assert.equal(groupPendingSettlements(report(sales, 10), new Map()), null);
  assert.equal(
    groupPendingSettlements(report([...sales, ...sales], 20), refs),
    null,
  );
  assert.equal(groupPendingSettlements(report(sales, 11), refs), null);
  assert.equal(groupPendingSettlements(report([], 1), refs), null);
  assert.deepEqual(groupPendingSettlements(report([], 0), refs), {
    stores: [],
    complete: true,
  });
});

test("retains partial coverage for known reconciled balances", () => {
  const value = report(
    [{ order_id: "order_known", pending_settlement: 10 }],
    10,
  );
  value.coverage.complete = false;
  assert.equal(
    groupPendingSettlements(
      value,
      references([["order_known", "seller_known"]]),
    )?.complete,
    false,
  );
});

test("reads store names once for all balances beyond the sales UI page, including missing names", async () => {
  const sources = source([
    ...Array.from({ length: 60 }, (_, index) =>
      allocation(`order_${index}`, "seller_named", 0.1),
    ),
    allocation("order_missing", "seller_missing", 0.2),
    allocation("order_qa", "seller_qa", 100, { data_kind: "qa_fixture" }),
  ]);
  let calls = 0;
  const response = await readAdminReportingProjection(
    container([row(sources)], async (input, options) => {
      calls++;
      assert.deepEqual(input, {
        entity: "seller",
        fields: ["id", "name"],
        filters: { id: ["seller_missing", "seller_named"] },
        pagination: { skip: 0, take: 2 },
      });
      assert.deepEqual(options, { cache: { enable: false } });
      return { data: [{ id: "seller_named", name: "Named store" }] };
    }),
    { actor_id: "user_test", query: filters, generated_at: generatedAt },
  );
  assert.equal(calls, 1);
  assert.equal(response.report.sales.length, 61);
  assert.deepEqual(response.report.pending_settlements, {
    stores: [
      { seller_id: "seller_missing", seller_name: null, amount: 0.2 },
      { seller_id: "seller_named", seller_name: "Named store", amount: 6 },
    ],
    complete: true,
  });
});

function movement(
  kind: ProviderFinanceFact["kind"],
  amountMinor: number,
): ProviderFinanceFact {
  const effectiveAt = "2026-10-05T12:00:00.000Z";
  return {
    key: `fact_${kind}`,
    kind,
    provider: "stripe",
    mode: "test",
    account_id: "acct_test",
    group_id: "group_test",
    operation_id: null,
    order_id: "order_history",
    seller_id: "seller_history",
    native_id: null,
    provider_id: `provider_${kind}`,
    charge_id: "ch_test",
    payment_intent_id: "pi_test",
    transfer_id: null,
    destination_account_id: null,
    provider_operation_id: null,
    provider_order_id: null,
    provider_seller_id: null,
    provider_transfer_group: null,
    amount_minor: amountMinor,
    currency_code: "usd",
    data_kind: "ordinary",
    component_attribution: "unallocated",
    effect_status: "confirmed",
    reconciliation_status: "matched",
    effective_at: effectiveAt,
    effective_source: "stripe_object_created",
    provider_event_id: null,
    provider_created_at: effectiveAt,
    balance_transaction_id: null,
    recorded_at: effectiveAt,
    reconciled_at: effectiveAt,
  };
}

test("uses the existing cumulative balance after historical refunds, transfers and reversals across periods", async () => {
  const sources = source(
    [
      allocation("order_history", "seller_history", 100, {
        effective_at: "2026-09-01T12:00:00.000Z",
        commission_recognized: 8,
        seller_entitlement_recognized: 92,
      }),
    ],
    {
      facts: [
        movement("refund", 1000),
        movement("transfer", 2000),
        movement("reversal", 500),
      ],
      refund_adjustments: [
        {
          fact_key: "fact_refund",
          operation_id: "refund_test",
          operation_state: "complete",
          order_id: "order_history",
          seller_id: "seller_history",
          amount: 10,
          seller_entitlement_reduced: 9.2,
          commission_returned: 0.8,
          currency_code: "usd",
          component_attribution: "unallocated",
        },
      ],
    },
  );
  for (const period of ["today", "last_30_days"] as const) {
    const response = await readAdminReportingProjection(
      container([row(sources)], async () => ({ data: [] })),
      {
        actor_id: "user_test",
        query: { ...filters, period },
        generated_at: generatedAt,
      },
    );
    assert.equal(response.report.totals.captured_volume, 0);
    assert.equal(response.report.totals.pending_settlement, 67.8);
    assert.deepEqual(response.report.pending_settlements?.stores, [
      { seller_id: "seller_history", seller_name: null, amount: 67.8 },
    ]);
  }
});

test("does not query names or disclose balances when registry discovery is incomplete", async () => {
  let calls = 0;
  const response = await readAdminReportingProjection(
    container(
      [row(source([allocation("order_known", "seller_known", 10)]))],
      async () => {
        calls++;
        return { data: [] };
      },
      false,
    ),
    { actor_id: "user_test", query: filters, generated_at: generatedAt },
  );
  assert.equal(response.report.totals.pending_settlement, null);
  assert.equal(response.report.pending_settlements, null);
  assert.equal(calls, 0);
});

test("does not distribute canceling unattributed transfers even if their net matches the total", async () => {
  const sources = source([allocation("order_history", "seller_history", 10)], {
    facts: [movement("transfer", 1000), movement("reversal", 1000)].map(
      (fact) => ({
        ...fact,
        order_id: null,
      }),
    ),
  });
  const response = await readAdminReportingProjection(
    container([row(sources)], async () => {
      throw new Error("Names must not be queried");
    }),
    { actor_id: "user_test", query: filters, generated_at: generatedAt },
  );
  assert.equal(response.report.totals.pending_settlement, 10);
  assert.equal(response.report.pending_settlements, null);
});

test("returns the current verified balance with partial coverage when historical allocations are unknown", async () => {
  const known = row(source([allocation("order_known", "seller_known", 204)]));
  const unknown = row(
    source(
      [
        allocation("order_unknown", "seller_unknown", 0, {
          group_id: "group_unknown",
          status: "unverified",
          captured_amount: null,
          merchandise_collected: null,
          commission_recognized: null,
          seller_entitlement_recognized: null,
        }),
      ],
      {
        coverage: {
          complete: false,
          issues: [
            {
              resource: "order_unknown",
              reason: "capture_allocation_unverified",
            },
          ],
          lists: [],
          capture_events_scope: "stripe_retained_events_30_days",
        },
      },
    ),
  );
  unknown.id = "group_unknown";
  const response = await readAdminReportingProjection(
    container([known, unknown], async () => ({
      data: [{ id: "seller_known", name: "Verified store" }],
    })),
    { actor_id: "user_test", query: filters, generated_at: generatedAt },
  );
  assert.equal(response.report.totals.pending_settlement, 204);
  assert.deepEqual(response.report.pending_settlements, {
    stores: [
      { seller_id: "seller_known", seller_name: "Verified store", amount: 204 },
    ],
    complete: false,
  });
});

test("rejects evidence whose seller does not own the native order reference", async () => {
  const invalid = row(source([allocation("order_known", "seller_known", 10)]));
  invalid.references[0].seller_id = "seller_other";
  let calls = 0;
  const response = await readAdminReportingProjection(
    container([invalid], async () => {
      calls++;
      return { data: [] };
    }),
    { actor_id: "user_test", query: filters, generated_at: generatedAt },
  );
  assert.equal(response.report.pending_settlements, null);
  assert.equal(response.report.freshness.pending_groups, 1);
  assert.equal(calls, 0);
});

test("preserves verified amounts with unknown names if the batch read fails", async () => {
  const response = await readAdminReportingProjection(
    container(
      [row(source([allocation("order_known", "seller_known", 10)]))],
      async () => {
        throw new Error("Seller read unavailable");
      },
    ),
    { actor_id: "user_test", query: filters, generated_at: generatedAt },
  );
  assert.deepEqual(response.report.pending_settlements, {
    stores: [{ seller_id: "seller_known", seller_name: null, amount: 10 }],
    complete: false,
  });
});

test("propagates cancellation during the store-name query", async () => {
  const controller = new AbortController();
  await assert.rejects(
    readAdminReportingProjection(
      container(
        [row(source([allocation("order_known", "seller_known", 10)]))],
        async () => {
          controller.abort();
          return { data: [] };
        },
      ),
      {
        actor_id: "user_test",
        query: filters,
        generated_at: generatedAt,
        signal: controller.signal,
      },
    ),
    { name: "AbortError" },
  );
});
