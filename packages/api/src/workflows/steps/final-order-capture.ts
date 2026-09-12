import type { MedusaContainer } from "@medusajs/framework/types";
import { MathBN, MedusaError } from "@medusajs/framework/utils";
import {
  financeAmount,
  type FinalCapture,
} from "../../lib/order-finance/policy";
import {
  assertProviderBalances,
  financeStripeClient,
  readFinanceProvider,
} from "../../lib/order-finance/provider";
import type { readOrderFinance } from "../../lib/order-finance/read";
import {
  recordAllocatedRefundWorkflow,
  recordFinalCaptureWorkflow,
} from "../order-finance-native";

// Called only by the owning finance step after its durable operation is committed.
export async function performFinalOrderCapture(
  container: MedusaContainer,
  input: {
    current: Awaited<ReturnType<typeof readOrderFinance>>;
    token: string;
    operationId: string;
    actorId: string;
  },
) {
  const { current, token, operationId } = input;
  const payment = current.group.orders[0].cart.payment_collection.payments[0];
  const amount = current.view.finance.capture.amount;
  const stripe = financeStripeClient();
  const intent = await stripe.paymentIntents.capture(
    payment.data.id,
    {
      amount_to_capture: MathBN.mult(amount, 100).toNumber(),
      // Ordinary manual payments support one capture and release the remainder.
      // Passing final_capture explicitly requires Stripe multicapture support.
      metadata: { marketplace_final_capture_operation_id: operationId },
    },
    { idempotencyKey: `order-finance:${operationId}:single-capture` },
  );
  if (
    intent.livemode ||
    intent.status !== "succeeded" ||
    intent.amount_capturable !== 0 ||
    !MathBN.eq(intent.amount_received, MathBN.mult(amount, 100))
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Stripe no confirmó el importe final de la captura.",
    );
  }
  const provider = await readFinanceProvider(payment.data.id);
  // Stripe API versions before Basil represent the uncaptured remainder as a
  // Refund. Record its exact IDs now, before any actual customer refund exists.
  const releasedIds = provider.refunds.map((refund) => refund.id);
  assertProviderBalances(provider, amount, 0, releasedIds);
  const { result } = await recordFinalCaptureWorkflow(container).run({
    input: {
      payment_id: payment.id,
      amount,
      is_captured: true,
      captured_by: input.actorId,
    },
  });
  if (
    result.captures?.length !== 1 ||
    !MathBN.eq(result.captures[0].amount, amount)
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La captura registrada requiere conciliación.",
    );
  const capture: FinalCapture = {
    capture_id: result.captures[0].id,
    released_refund_ids: releasedIds,
    orders: current.allocation.orders.map((part) => ({
      order_id: part.order_id,
      amount:
        current.group.orders.find((order) => order.id === part.order_id)
          ?.status === "canceled"
          ? 0
          : financeAmount(part.amount),
    })),
  };
  for (const part of capture.orders) {
    if (!financeAmount(part.amount)) continue;
    await recordAllocatedRefundWorkflow(container).run({
      input: {
        order_id: part.order_id,
        amount: financeAmount(part.amount),
        currency_code: "usd",
        reference: "capture",
        reference_id: capture.capture_id,
      },
    });
  }
  await current.journal.observeGroup(
    current.group.id,
    token,
    { finance_final_capture: capture },
    false,
  );
}
