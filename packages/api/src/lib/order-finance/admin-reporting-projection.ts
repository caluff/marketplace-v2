import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import {
  ownedAdminReportingSources,
  type AdminReportingSource,
} from "../../modules/commerce-automation/admin-finance-reporting";
import type {
  AdminFinanceReportingResponse,
  FinanceReportingQuery,
} from "./contracts";
import { aggregateFinanceReporting } from "./reporting";
import { resolveFinanceReportingWindow } from "./reporting-period";
import type { FinanceReportingSources } from "./reporting-sources";

export function groupReportingSources(
  value: unknown,
  row: AdminReportingSource,
): FinanceReportingSources {
  return ownedAdminReportingSources(value, row);
}

function unavailableSource(groupId: string): FinanceReportingSources {
  return {
    facts: [],
    costs: [],
    capture_allocations: [],
    refund_adjustments: [],
    coverage: {
      complete: false,
      issues: [{ resource: groupId, reason: "reporting_source_unavailable" }],
      lists: [],
      capture_events_scope: "stripe_retained_events_30_days",
    },
  };
}

/** Internal read after the HTTP caller proves current operator authority.
 * One private registry snapshot plus the existing financial arithmetic. */
export async function readAdminReportingProjection(
  container: MedusaContainer,
  input: {
    actor_id: string;
    query: FinanceReportingQuery;
    generated_at?: Date;
    signal?: AbortSignal;
  },
): Promise<AdminFinanceReportingResponse> {
  input.signal?.throwIfAborted();
  if (!input.actor_id)
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Debes iniciar sesión.",
    );
  const registry = await container
    .resolve<CommerceAutomationService>(COMMERCE_AUTOMATION_MODULE)
    .readAdminFinanceReportingRegistry();
  input.signal?.throwIfAborted();
  const sources: FinanceReportingSources[] = [];
  let pendingGroups = 0;
  let principalIncomplete = false;
  for (const row of registry.rows) {
    try {
      if (!row.is_fresh || row.unsafe)
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Reporting projection awaits verification.",
        );
      const source = groupReportingSources(row.sources, row);
      if (
        source.coverage.issues.some((issue) =>
          ["reporting_source_unavailable", "reporting_read_changed"].includes(
            issue.reason,
          ),
        )
      )
        throw new MedusaError(
          MedusaError.Types.CONFLICT,
          "Native reporting verification has not completed.",
        );
      const matchesFilter = [
        ...source.facts,
        ...source.capture_allocations,
      ].some(
        (part) =>
          part.data_kind === input.query.data_kind ||
          part.data_kind === "unknown",
      );
      if (
        matchesFilter &&
        !source.coverage.complete &&
        (!source.coverage.issues.length ||
          source.coverage.issues.some(
            (issue) => !/cost|fee/i.test(issue.reason),
          ))
      )
        principalIncomplete = true;
      sources.push(source);
    } catch {
      pendingGroups++;
      sources.push(unavailableSource(row.id));
    }
  }
  const result = aggregateFinanceReporting(
    input.query,
    resolveFinanceReportingWindow(
      input.query.period,
      input.generated_at ?? new Date(),
    ),
    sources,
    { sourceLimitReached: registry.truncated },
  );
  const references = new Map(
    registry.rows.flatMap((row) =>
      row.references.map((reference) => [reference.id, reference] as const),
    ),
  );
  result.report.sales = result.report.sales.map((sale) => ({
    ...sale,
    order_display_id: references.get(sale.order_id)?.order_display_id ?? null,
    order_custom_display_id:
      references.get(sale.order_id)?.order_custom_display_id ?? null,
  }));
  const response: AdminFinanceReportingResponse = {
    report: {
      ...result.report,
      freshness: {
        refreshed_at: null,
        pending_groups: pendingGroups,
        discovery_complete: registry.discovery.complete,
      },
    },
  };
  if (!registry.discovery.complete) {
    response.report.coverage.complete = false;
    response.report.coverage.partial_reasons.push({
      reason: "reporting_discovery_incomplete",
      count: 1,
    });
  }
  if (pendingGroups)
    response.report.coverage.partial_reasons.push({
      reason: "reporting_projection_pending",
      count: pendingGroups,
    });
  const hasVerifiedSales = response.report.sales.some(
    (sale) =>
      sale.capture_status === "confirmed" && sale.coverage === "complete",
  );
  if (
    pendingGroups ||
    !registry.discovery.complete ||
    registry.truncated ||
    (principalIncomplete && !hasVerifiedSales)
  ) {
    for (const key of Object.keys(response.report.totals) as Array<
      keyof typeof response.report.totals
    >)
      response.report.totals[key] = null;
  } else {
    const refreshed = registry.rows
      .flatMap((row) => (row.refreshed_at ? [row.refreshed_at] : []))
      .sort();
    response.report.freshness.refreshed_at = refreshed[0] ?? null;
  }
  return response;
}
