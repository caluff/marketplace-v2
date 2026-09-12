import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { validateSellerOrder } from "@mercurjs/core/api/vendor/orders/helpers";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import type CommerceAutomationService from "../../modules/commerce-automation/service";
import {
  financeAllocationSchema,
  financeAmount,
  financeGroupSchema,
  financeOperationSchema,
  financeView,
  initialAllocation,
  finalCaptureSchema,
} from "./policy";
import { financePayoutSchema, type FinancePayout } from "./settlement";
import type { OrderFinanceResponse } from "./contracts";

export type FinanceActor = { actor_id: string; seller_id?: string };
const GROUP_FIELDS = [
  "id",
  "cart_id",
  "orders.id",
  "orders.version",
  "orders.status",
  "orders.currency_code",
  "orders.total",
  "orders.summary",
  "orders.payment_collections.id",
  "orders.seller.id",
  "orders.fulfillments.id",
  "orders.fulfillments.canceled_at",
  // Medusa calculates totals from the loaded line fields. A partial item
  // projection omits quantity/prices and silently produces a zero total.
  "orders.items.*",
  "orders.items.detail.*",
  "orders.items.tax_lines.*",
  "orders.items.adjustments.*",
  "orders.shipping_methods.*",
  "orders.shipping_methods.tax_lines.*",
  "orders.shipping_methods.adjustments.*",
  "orders.credit_lines.*",
  "orders.transactions.id",
  "orders.transactions.amount",
  "orders.transactions.reference",
  "orders.transactions.reference_id",
  "orders.cart.id",
  "orders.cart.payment_collection.id",
  "orders.cart.payment_collection.amount",
  "orders.cart.payment_collection.status",
  ...[
    "id",
    "amount",
    "provider_id",
    "canceled_at",
    "data",
    "captures.id",
    "captures.amount",
    "refunds.id",
    "refunds.amount",
    "refunds.metadata",
  ].map((field) => `orders.cart.payment_collection.payments.${field}`),
];

export async function readOrderFinance(
  container: MedusaContainer,
  orderId: string,
  actor: FinanceActor,
  ownedToken?: string,
) {
  if (!actor.actor_id)
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Debes iniciar sesión.",
    );
  if (actor.seller_id !== undefined) {
    if (!actor.seller_id)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Selecciona una tienda.",
      );
    await validateSellerOrder(container, actor.seller_id, orderId);
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: links } = await query.graph(
    {
      entity: "order_group_order",
      fields: ["order_group_id"],
      filters: { order_id: orderId },
    },
    { cache: { enable: false } },
  );
  if (links.length !== 1)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El pedido no tiene un grupo de compra inequívoco.",
    );
  const { data: groups } = await query.graph(
    {
      entity: "order_group",
      fields: GROUP_FIELDS,
      filters: { id: links[0].order_group_id },
    },
    { cache: { enable: false } },
  );
  const parsed = financeGroupSchema.safeParse(groups[0]);
  if (!parsed.success) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `[order-finance] Invalid projection paths: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
      );
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "No se pudo verificar el pago y el reparto de este pedido.",
    );
  }
  const group = parsed.data;
  const journal = container.resolve<CommerceAutomationService>(
    COMMERCE_AUTOMATION_MODULE,
  );
  const [states, operations, payoutLinks, pendingChanges] = await Promise.all([
    journal.listCommerceGroupStates({ id: group.id }, { take: 1 }),
    journal.listCommerceOperations(
      { group_id: group.id },
      { take: 1001, order: { created_at: "ASC" } },
    ),
    query.graph(
      {
        entity: "payout_seller",
        fields: [
          "seller_id",
          "payout.id",
          "payout.data",
          "payout.status",
          "payout.amount",
          "payout.currency_code",
          "payout.account_id",
          "payout.account.id",
          "payout.account.data",
        ],
        filters: { seller_id: group.orders.map((order) => order.seller.id) },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "order_change",
        fields: ["id"],
        filters: {
          order_id: group.orders.map((order) => order.id),
          status: "pending",
        },
        pagination: { take: 1 },
      },
      { cache: { enable: false } },
    ),
  ]);
  if (operations.length > 1000)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Este grupo requiere conciliación del operador.",
    );
  const state = states[0];
  const allocation =
    state?.observation?.finance_allocation === undefined
      ? initialAllocation(group)
      : financeAllocationSchema.parse(state.observation.finance_allocation);
  const history: OrderFinanceResponse["finance"]["history"] = [];
  const finalCapture =
    state?.observation?.finance_final_capture === undefined
      ? undefined
      : finalCaptureSchema.parse(state.observation.finance_final_capture);
  const knownRefundIds: string[] = [];
  let invalidOperation = false;
  for (const operation of operations) {
    if (!["refund", "cancel", "capture"].includes(operation.kind)) continue;
    const value = financeOperationSchema.safeParse(operation.result);
    if (!value.success) {
      invalidOperation = true;
      continue;
    }
    if (operation.state === "complete")
      knownRefundIds.push(...value.data.refund_ids);
    if (value.data.order_id !== orderId && value.data.action !== "capture")
      continue;
    history.push({
      id: operation.id,
      kind: value.data.action,
      amount:
        value.data.action === "capture"
          ? financeAmount(
              finalCapture?.orders.find((part) => part.order_id === orderId)
                ?.amount ?? 0,
            )
          : financeAmount(value.data.amount),
      status: operation.state,
      note: value.data.note,
      created_at: operation.created_at.toISOString(),
      ...(value.data.settlement &&
      (value.data.settlement.reversal_id || operation.state === "complete")
        ? {
            seller_reversed: financeAmount(
              value.data.settlement.seller_reversed,
            ),
          }
        : {}),
      ...(value.data.settlement && operation.state === "complete"
        ? {
            commission_returned: financeAmount(
              value.data.settlement.commission_returned,
            ),
          }
        : {}),
    });
  }
  const sellerId = group.orders.find((order) => order.id === orderId)?.seller
    .id;
  const matchingPayouts = payoutLinks.data.filter(
    (link) =>
      link.seller_id === sellerId &&
      (!(link.payout?.data?.transfer_group ?? link.payout?.data?.order_id) ||
        (link.payout?.data?.transfer_group ?? link.payout?.data?.order_id) ===
          orderId),
  );
  let payout: FinancePayout | undefined;
  let payoutProblem: string | null = null;
  if (matchingPayouts.length) {
    const parsedPayout = financePayoutSchema.safeParse(
      matchingPayouts[0].payout,
    );
    if (
      matchingPayouts.length !== 1 ||
      !parsedPayout.success ||
      parsedPayout.data.data.transfer_group !== orderId
    ) {
      payoutProblem =
        "La liquidación de esta tienda requiere conciliación antes del reembolso.";
    } else payout = parsedPayout.data;
  }
  const view = financeView({
    group,
    orderId,
    allocation,
    history,
    knownRefundIds,
    hasPayout: false,
    payoutProblem,
    finalCapture,
    isOperator: actor.seller_id === undefined,
    isHeld:
      invalidOperation ||
      Boolean(state?.review_required) ||
      Boolean(state?.active_token && state.active_token !== ownedToken),
  });
  if (pendingChanges.data.length) {
    const reason =
      "Finaliza o descarta la modificación o devolución pendiente del pedido antes de continuar.";
    view.finance.refund = { allowed: false, reason };
    view.finance.capture = { ...view.finance.capture, allowed: false, reason };
    view.finance.cancellation = {
      ...view.finance.cancellation,
      allowed: false,
      reason,
    };
  }
  return {
    group,
    allocation,
    finalCapture,
    payout,
    operations,
    journal,
    state,
    view,
  };
}
