import { BigNumber } from "@medusajs/framework/utils";
import {
  orderFinanceInputSchema,
  type OrderFinanceResponse,
} from "../contracts";
import {
  financeAmount,
  financeGroupSchema,
  financeView,
  initialAllocation,
} from "../policy";
import { financeGroup } from "./fixtures";

const REQUEST_ID = "d8e46278-a58c-4ab1-bfef-ed87edacbd1c";
const body = {
  action: "refund",
  amount: 12.34,
  note: "  Ajuste de importe  ",
  request_id: REQUEST_ID,
  confirm: true,
};

describe("order finance input", () => {
  it("preserves display-unit amounts, trims notes and requires explicit confirmation", () => {
    expect(orderFinanceInputSchema.parse(body)).toEqual({
      ...body,
      note: "Ajuste de importe",
    });
    expect(
      orderFinanceInputSchema.safeParse({ ...body, confirm: false }).success,
    ).toBe(false);
    expect(
      orderFinanceInputSchema.safeParse({ ...body, confirm: undefined })
        .success,
    ).toBe(false);
  });

  it.each([undefined, 0, -1, Infinity, NaN, "12.34"])(
    "rejects invalid refund amount %s",
    (amount) => {
      expect(
        orderFinanceInputSchema.safeParse({ ...body, amount }).success,
      ).toBe(false);
    },
  );

  it("calculates cancellation amounts on the server and rejects client-owned routing fields", () => {
    expect(
      orderFinanceInputSchema.safeParse({
        ...body,
        action: "cancel",
        amount: undefined,
      }).success,
    ).toBe(true);
    expect(
      orderFinanceInputSchema.safeParse({ ...body, action: "cancel" }).success,
    ).toBe(false);
    for (const extra of [
      { order_id: "other" },
      { seller_id: "other" },
      { payment_id: "other" },
    ]) {
      expect(
        orderFinanceInputSchema.safeParse({ ...body, ...extra }).success,
      ).toBe(false);
    }
  });

  it.each([
    { request_id: "retry" },
    { note: "  " },
    { note: "x".repeat(501) },
    { action: "capture" },
  ])("rejects invalid request %j", (change) => {
    expect(
      orderFinanceInputSchema.safeParse({ ...body, ...change }).success,
    ).toBe(false);
  });

  it("rejects fractional cents and negative amounts without rounding", () => {
    expect(financeAmount("12.34")).toBe(12.34);
    expect(financeAmount(0)).toBe(0);
    expect(() => financeAmount(12.345)).toThrow();
    expect(() => financeAmount(-1)).toThrow();
    expect(() => financeAmount("9999999999999999")).toThrow();
  });
});

describe("order-scoped refund policy", () => {
  function fixture() {
    const group = financeGroup();
    const input = {
      group,
      orderId: "order_1",
      allocation: initialAllocation(group),
      history: [] as OrderFinanceResponse["finance"]["history"],
      knownRefundIds: [] as string[],
      isHeld: false,
      hasPayout: false,
    };
    return {
      input,
      group,
      payment: group.orders[0].cart.payment_collection.payments[0],
      view: () => financeView(input).finance,
    };
  }

  it("normalizes native BigNumber graph totals and signed accounting balances", () => {
    const group = financeGroup();
    const parsed = financeGroupSchema.parse({
      ...group,
      orders: group.orders.map((order) => ({
        ...order,
        total: new BigNumber(order.total),
        summary: { pending_difference: new BigNumber(-12.25) },
        transactions: [
          {
            id: "tx_refund",
            reference: "refund",
            reference_id: "ref_native",
            amount: new BigNumber(-5.75),
          },
        ],
      })),
    });
    expect(initialAllocation(parsed).orders).toEqual([
      { order_id: "order_1", amount: 70 },
      { order_id: "order_2", amount: 80 },
    ]);
    expect(parsed.orders[0].summary?.pending_difference).toBe(-12.25);
    expect(parsed.orders[0].transactions[0].amount).toBe(-5.75);
  });

  it("uses authoritative discounted totals including shipping and retains the original allocation", () => {
    const state = fixture();
    // Backend total already includes a discount and shipping; item subtotals are not inputs.
    state.group.orders[0].total = "64.75";
    state.group.orders[1].total = "85.25";
    state.input.allocation = initialAllocation(state.group);
    expect(state.input.allocation.orders).toEqual([
      { order_id: "order_1", amount: 64.75 },
      { order_id: "order_2", amount: 85.25 },
    ]);
    state.group.orders[0].total = 54.75;
    expect(state.view()).toMatchObject({
      allocated_total: 64.75,
      refundable_total: 64.75,
      refund: { allowed: true },
    });
  });

  it("keeps the other seller's capacity intact after a partial and then full refund", () => {
    const state = fixture();
    for (const amount of [20, 70]) {
      state.payment.refunds = [{ id: "ref_seller_1", amount, metadata: null }];
      state.input.knownRefundIds = ["ref_seller_1"];
      state.input.history = [
        {
          id: "operation_1",
          kind: "refund",
          amount,
          status: "complete",
          note: "Ajuste",
          created_at: "2026-09-12T12:00:00Z",
        },
      ];
      expect(state.view()).toMatchObject({
        refunded_total: amount,
        refundable_total: 70 - amount,
        refund: { allowed: amount < 70 },
      });
      expect(
        financeView({ ...state.input, orderId: "order_2", history: [] })
          .finance,
      ).toMatchObject({
        allocated_total: 80,
        refunded_total: 0,
        refundable_total: 80,
        refund: { allowed: true },
      });
    }
  });

  it("allows cancellation of an uncharged authorization with no refund", () => {
    const state = fixture();
    state.payment.captures = [];
    expect(state.view()).toMatchObject({
      refundable_total: 0,
      cancellation: { allowed: true, refund_amount: 0 },
      refund: { allowed: false },
    });
  });

  it.each(["completed", "canceled", "archived"])(
    "does not cancel a %s order",
    (status) => {
      const state = fixture();
      state.group.orders[0].status = status;
      expect(state.view().cancellation.allowed).toBe(false);
    },
  );

  it.each(["draft", "archived", "requires_action", "unexpected"])(
    "does not refund an unverified %s order",
    (status) => {
      const state = fixture();
      state.group.orders[0].status = status;
      expect(state.view().refund.allowed).toBe(false);
    },
  );

  it("requires all native fulfillments to be canceled before canceling the order", () => {
    const state = fixture();
    state.group.orders[0].fulfillments = [{ id: "ful_1", canceled_at: null }];
    expect(state.view().cancellation.allowed).toBe(false);
    state.group.orders[0].fulfillments[0].canceled_at = "2026-09-12T12:00:00Z";
    expect(state.view().cancellation.allowed).toBe(true);
  });

  it.each([
    "unassigned refund",
    "partial capture",
    "multiple captures",
    "previous payout",
    "held state",
    "uncertain operation",
    "wrong capture allocation",
  ])("blocks both operations for %s", (mode) => {
    const state = fixture();
    if (mode === "unassigned refund")
      state.payment.refunds = [
        { id: "historical", amount: 10, metadata: null },
      ];
    if (mode === "partial capture") state.payment.captures[0].amount = 75;
    if (mode === "multiple captures")
      state.payment.captures = [
        { id: "cap_a", amount: 75 },
        { id: "cap_b", amount: 75 },
      ];
    if (mode === "previous payout") state.input.hasPayout = true;
    if (mode === "held state") state.input.isHeld = true;
    if (mode === "uncertain operation")
      state.input.history = [
        {
          id: "pending",
          amount: 10,
          kind: "refund",
          status: "uncertain",
          note: "Ajuste",
          created_at: "2026-09-12T12:00:00Z",
        },
      ];
    if (mode === "wrong capture allocation")
      state.group.orders[0].transactions = [
        {
          id: "tx_bad",
          amount: 150,
          reference: "capture",
          reference_id: "cap_shared",
        },
      ];
    expect(state.view()).toMatchObject({
      refund: { allowed: false, reason: expect.any(String) },
      cancellation: { allowed: false, reason: expect.any(String) },
    });
  });

  it("rejects unknown order IDs and invalid provider/currency graph data", () => {
    const state = fixture();
    expect(() =>
      financeView({ ...state.input, orderId: "order_other" }),
    ).toThrow("Pedido no encontrado");
    expect(financeGroupSchema.safeParse(state.group).success).toBe(true);
    expect(
      financeGroupSchema.safeParse({
        ...state.group,
        orders: [{ ...state.group.orders[0], currency_code: "eur" }],
      }).success,
    ).toBe(false);
    expect(
      financeGroupSchema.safeParse({
        ...state.group,
        orders: [
          {
            ...state.group.orders[0],
            cart: {
              ...state.group.orders[0].cart,
              payment_collection: {
                ...state.group.orders[0].cart.payment_collection,
                payments: [
                  { ...state.payment, data: { id: "pi_live", livemode: true } },
                ],
              },
            },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
