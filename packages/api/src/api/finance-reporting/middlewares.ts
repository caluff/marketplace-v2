import {
  validateAndTransformQuery,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { PolicyOperation } from "@medusajs/framework/utils";
import { financeReportingQuerySchema } from "../../lib/order-finance/contracts";

export const financeReportingMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/finance/reporting",
    method: "GET",
    middlewares: [validateAndTransformQuery(financeReportingQuerySchema, {})],
  },
  {
    matcher: "/vendor/finance/reporting",
    method: "GET",
    middlewares: [validateAndTransformQuery(financeReportingQuerySchema, {})],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
];
