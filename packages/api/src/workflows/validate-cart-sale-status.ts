import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  assertCartLineIncreaseNotPaused,
  assertOffersNotPaused,
} from "../lib/catalog/sale-pause";

type Input =
  | { operation: "add"; offer_id: string }
  | { operation: "update"; cart_id: string; line_id: string; quantity: number };

const validateCartSaleStatusStep = createStep(
  "validate-cart-sale-status",
  async (input: Input, { container }) => {
    if (input.operation === "add") {
      await assertOffersNotPaused(container, [input.offer_id]);
    } else {
      await assertCartLineIncreaseNotPaused(
        container,
        input.cart_id,
        input.line_id,
        input.quantity,
      );
    }
    return new StepResponse({ valid: true });
  },
);

// Mercur owns the native add/update validate hooks. The Store API runs this
// preflight before the unchanged native workflows; checkout rechecks the pause.
export const validateCartSaleStatusWorkflow = createWorkflow(
  "validate-cart-sale-status",
  function (input: Input) {
    return new WorkflowResponse(validateCartSaleStatusStep(input));
  },
);
