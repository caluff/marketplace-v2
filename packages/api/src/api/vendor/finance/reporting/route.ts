import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type {
  FinanceReportingQuery,
  FinanceReportingResponse,
} from "../../../../lib/order-finance/contracts";
import { readFinanceReporting } from "../../../../lib/order-finance/reporting";

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, FinanceReportingQuery>,
  res: MedusaResponse<FinanceReportingResponse>,
) {
  res.setHeader("Cache-Control", "private, no-store");
  const sellerId = req.seller_context?.seller_id ?? "";
  const report = await readFinanceReporting(req.scope, {
    actor_id: req.auth_context.actor_id,
    seller_id: sellerId,
    query: req.validatedQuery,
  });
  res.json(report);
}
