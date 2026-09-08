import type { Logger, MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { commerceAutomationEnabled } from "../lib/commerce-automation/configuration";
import { evaluateCommerceWorkflow } from "../workflows/evaluate-commerce";

export default async function evaluateCommerce(container: MedusaContainer) {
  if (!commerceAutomationEnabled()) return;
  try {
    await evaluateCommerceWorkflow(container).run({ input: {} });
  } catch {
    container
      .resolve<Logger>(ContainerRegistrationKeys.LOGGER)
      .warn(
        "[commerce-automation] Evaluation stopped; persisted claims require reconciliation.",
      );
  }
}

export const config = { name: "evaluate-commerce", schedule: "*/15 * * * *" };
