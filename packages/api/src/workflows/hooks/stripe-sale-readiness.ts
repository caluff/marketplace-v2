import { completeCartWithSplitOrdersWorkflow } from "@mercurjs/core/workflows";
import { assertCartSellersReadyForSale } from "../../lib/stripe-connect/sale-readiness";
import { assertCartProductsNotPaused } from "../../lib/catalog/sale-pause";

// Covers both the native Store API and payment-webhook-driven cart completion.
completeCartWithSplitOrdersWorkflow.hooks.validate(
  async ({ input }, { container }) => {
    await assertCartSellersReadyForSale(container, input.cart_id);
    await assertCartProductsNotPaused(container, input.cart_id);
  },
);
