import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { completeCartWithSplitOrdersWorkflow } from "@mercurjs/core/workflows";
import "@mercurjs/core/workflows/cart/hooks/index";
import "../hooks/stripe-sale-readiness";

const completeFromParentWorkflow = createWorkflow("complete-cart-retry-from-parent", function(input: { cart_id: string }) {
  const result = completeCartWithSplitOrdersWorkflow.runAsStep({ input });
  return new WorkflowResponse(result);
});

it.each(["direct", "nested"] as const)("%s completion retries retain the cart lock and reuse orders without reserving or authorizing again", async (invocation) => {
  const cartId = "cart_completed";
  const existingGroup = { id: "og_existing", cart_id: cartId };
  const existingCart = {
    id: cartId,
    completed_at: "2026-09-08T00:00:00Z",
    total: 220,
    credit_line_total: 0,
    payment_collection: {
      id: "paycol_existing",
      payment_sessions: [{ id: "payses_existing", status: "authorized" }],
    },
  };
  let isCartLocked = false;
  const graph = jest.fn(async ({ entity, fields }: { entity: string; fields: string[] }) => {
    if (!isCartLocked) throw new Error("Completion must hold the cart lock before reading existing orders.");
    if (entity === "order_group") {
      // Query only returns selected fields. Returning id unconditionally hid
      // the native lookup bug that recreated orders on completion retries.
      return { data: [Object.fromEntries(fields.map((field) => [field, existingGroup[field as keyof typeof existingGroup]]))] };
    }
    if (entity === "cart") return { data: [structuredClone(existingCart)] };
    throw new Error(`A completion retry must not query ${entity} to create another sale.`);
  });
  const acquire = jest.fn(async () => { isCartLocked = true; });
  const release = jest.fn(async () => { isCartLocked = false; return true; });
  const createOrders = jest.fn();
  const createReservationItems = jest.fn();
  const authorizePaymentSession = jest.fn();
  const container = createMedusaContainer();
  container.register({
    query: asValue({ graph }),
    locking: asValue({ acquire, release }),
    order: asValue({ createOrders }),
    inventory: asValue({ createReservationItems }),
    payment: asValue({ authorizePaymentSession }),
    logger: asValue({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }),
  });

  const workflow = invocation === "nested" ? completeFromParentWorkflow : completeCartWithSplitOrdersWorkflow;
  for (let retry = 0; retry < 2; retry++) {
    const { result } = await workflow(container).run({ input: { cart_id: cartId } });
    expect(result).toEqual({ order_group_id: existingGroup.id });
  }

  expect(acquire).toHaveBeenCalledTimes(2);
  expect(acquire).toHaveBeenCalledWith(cartId, expect.objectContaining({ expire: 120 }));
  expect(release).toHaveBeenCalledTimes(2);
  expect(createOrders).not.toHaveBeenCalled();
  expect(createReservationItems).not.toHaveBeenCalled();
  expect(authorizePaymentSession).not.toHaveBeenCalled();
});
