import {
  financeGroupSchema,
  financeOperationSchema,
  financeView,
  initialAllocation,
} from "../policy";
import { financeGroup } from "./fixtures";

it("preserves native return counters for cumulative quantity guards", () => {
  const group = financeGroup();
  group.orders[0].items = [
    {
      id: "item_1",
      quantity: 3,
      detail: {
        fulfilled_quantity: 3,
        shipped_quantity: 3,
        return_requested_quantity: 2,
        return_received_quantity: 1,
        return_dismissed_quantity: 1,
      },
    },
  ];
  expect(financeGroupSchema.parse(group).orders[0].items).toEqual(
    group.orders[0].items,
  );
});

function view(group = financeGroup(), customerId?: string) {
  if (customerId !== undefined && group.orders[0].customer_id === undefined)
    group.orders[0].customer_id = customerId;
  return financeView({
    group,
    orderId: "order_1",
    allocation: initialAllocation(group),
    history: [],
    knownRefundIds: [],
    isHeld: false,
    hasPayout: false,
    isOperator: customerId === undefined,
    customerId,
  }).finance;
}

it("lets the buyer cancel an open unprepared order without granting operator powers", () => {
  const finance = view(financeGroup(), "cus_owner");
  expect(finance.cancellation.allowed).toBe(true);
  expect(finance.refund.allowed).toBe(false);
  expect(finance.capture.allowed).toBe(false);
  expect(finance.capture.amount).toBe(0);
});
it("rejects a financial projection for an order owned by another customer", () => {
  const group = financeGroup();
  group.orders[0].customer_id = "cus_other";
  expect(() => view(group, "cus_owner")).toThrow(
    "No encontramos este pedido en tu cuenta.",
  );
});

it("blocks buyer cancellation after any preparation, even when it was subsequently canceled", () => {
  for (const canceled_at of [null, "2026-10-07T12:00:00Z"]) {
    const group = financeGroup();
    group.orders[0].fulfillments = [{ id: "ful_prepared", canceled_at }];
    expect(view(group, "cus_owner").cancellation.allowed).toBe(false);
  }
});

it("preserves staff cancellation after all preparations have been canceled", () => {
  const group = financeGroup();
  group.orders[0].fulfillments = [
    { id: "ful_canceled", canceled_at: "2026-10-07T12:00:00Z" },
  ];
  expect(view(group).cancellation.allowed).toBe(true);
});

it("never enables buyer cancellation for completed, canceled or review-required orders", () => {
  for (const status of ["completed", "canceled", "requires_action"]) {
    const group = financeGroup();
    group.orders[0].status = status;
    expect(view(group, "cus_owner").cancellation.allowed).toBe(false);
  }
});

it("keeps the buyer identity in durable operation evidence", () => {
  const operation = financeOperationSchema.parse({
    actor_id: "cus_owner",
    customer_id: "cus_owner",
    order_id: "order_1",
    request_id: "755f0a82-7cf6-4195-b833-825c955918dc",
    action: "cancel",
    amount: 70,
    note: "Cancelación del comprador",
    fingerprint: "fingerprint",
  });
  expect(operation.customer_id).toBe("cus_owner");
});
