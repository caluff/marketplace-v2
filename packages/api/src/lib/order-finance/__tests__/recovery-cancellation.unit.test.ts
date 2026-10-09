import type { MedusaContainer } from "@medusajs/framework/types";
import { financeView, initialAllocation } from "../policy";
import { readOrderFinance } from "../read";
import { financeStripeClient, readFinanceProvider } from "../provider";
import { inspectFinanceRecovery, type RecoveryCurrent } from "../recovery-plan";
import { inspectAuthorizationRecovery } from "../recovery-authorization";
import { prepareSettlement } from "../settlement";
import { readOrderTransfers } from "../list-order-transfers";
import { financeGroup, originalSales } from "./fixtures";

jest.mock("../read", () => ({ readOrderFinance: jest.fn() }));
jest.mock("../provider", () => ({
  ...jest.requireActual("../provider"),
  financeStripeClient: jest.fn(),
  readFinanceProvider: jest.fn(),
}));
jest.mock("../list-order-transfers", () => ({ readOrderTransfers: jest.fn() }));
jest.mock("../settlement", () => {
  const actual =
    jest.requireActual<typeof import("../settlement")>("../settlement");
  return { ...actual, prepareSettlement: jest.fn(actual.prepareSettlement) };
});
jest.mock("../settlement-plan", () => ({
  ...jest.requireActual("../settlement-plan"),
  requireFinanceOperator: jest.fn(),
}));
jest.mock("../recovery-authorization", () => ({
  inspectAuthorizationRecovery: jest.fn(),
}));

const container = {} as MedusaContainer;
const nativePrepareSettlement =
  jest.requireActual<typeof import("../settlement")>(
    "../settlement",
  ).prepareSettlement;
const refundRequestId = "11111111-1111-4111-8111-111111111111";
const cancelRequestId = "22222222-2222-4222-8222-222222222222";
const refundOperationId = `refund:order_1:${refundRequestId}`;
const cancelOperationId = `cancel:order_1:${cancelRequestId}`;
const input = {
  order_id: "order_1",
  operation_id: cancelOperationId,
  actor_id: "user_operator",
  reason: "Recover cancellation after a fully verified refund",
};

function refundedPurchase() {
  const group = financeGroup();
  const order = group.orders[0];
  const payment = order.cart.payment_collection.payments[0];
  payment.refunds = [
    {
      id: "ref_full",
      amount: 70,
      metadata: { order_id: order.id, finance_operation_id: refundOperationId },
    },
  ];
  order.transactions = [
    {
      id: "trans_capture",
      amount: 70,
      reference: "capture",
      reference_id: "cap_shared",
      currency_code: "usd",
    },
    {
      id: "trans_refund",
      amount: -70,
      reference: "refund",
      reference_id: "ref_full",
      currency_code: "usd",
    },
  ];
  order.credit_lines = [
    {
      id: "credit_full",
      amount: 70,
      reference: "refund",
      reference_id: "ref_full",
    },
  ];
  const originals = originalSales(group);
  const operation = {
    id: cancelOperationId,
    kind: "cancel",
    state: "uncertain",
    token: "token_cancellation",
    result: {
      order_id: order.id,
      request_id: cancelRequestId,
      action: "cancel",
      amount: 0,
      note: "Cancel after total refund",
      fingerprint: "fingerprint_cancel",
      refund_ids: [],
      refund_attempted: false,
      reversal_attempted: false,
      capture_attempted: false,
      cancel_authorization_attempted: false,
    },
  };
  const prior = {
    id: refundOperationId,
    kind: "refund",
    state: "complete",
    result: {
      order_id: order.id,
      request_id: refundRequestId,
      action: "refund",
      amount: 70,
      credit_amount: 70,
      note: "Total refund",
      fingerprint: "fingerprint_refund",
      refund_ids: ["ref_full"],
      provider_refund_id: "re_full",
      settlement: {
        version: 2,
        gross: 70,
        seller_net: 64.4,
        seller_entitlement_reduced: 64.4,
        seller_reversal_amount: 0,
        seller_reversed: 0,
        commission_returned: 5.6,
      },
    },
  };
  const allocation = initialAllocation(group);
  const view = financeView({
    group,
    allocation,
    orderId: order.id,
    history: [
      {
        id: prior.id,
        kind: "refund",
        amount: 70,
        status: "complete",
        note: "Total refund",
        created_at: "2026-10-07T00:00:00Z",
      },
    ],
    knownRefundIds: ["ref_full"],
    isHeld: false,
    hasPayout: false,
    isOperator: true,
  });
  const current = {
    group,
    allocation,
    view,
    originals,
    original: originals[0],
    originalProblem: null,
    financialProblem: null,
    hasPendingChanges: false,
    operations: [prior, operation],
    state: { active_token: operation.token },
  } as unknown as RecoveryCurrent;
  const provider = {
    intent: {
      id: "pi_test",
      status: "succeeded",
      amount: 15000,
      amount_received: 15000,
      amount_capturable: 0,
      latest_charge: "ch_shared",
      currency: "usd",
      livemode: false,
    },
    refunds: [
      {
        id: "re_full",
        amount: 7000,
        currency: "usd",
        status: "succeeded",
        payment_intent: "pi_test",
        charge: "ch_shared",
        metadata: {
          order_id: order.id,
          finance_operation_id: refundOperationId,
        },
      },
    ],
  } as unknown as Awaited<ReturnType<typeof readFinanceProvider>>;
  jest.mocked(readOrderFinance).mockResolvedValue(current);
  jest.mocked(readFinanceProvider).mockResolvedValue(provider);
  return { current, order, payment, operation, prior, provider };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(prepareSettlement).mockImplementation(nativePrepareSettlement);
  jest.mocked(readOrderTransfers).mockResolvedValue([]);
  jest.mocked(financeStripeClient).mockReturnValue({
    charges: {
      retrieve: jest.fn().mockResolvedValue({
        id: "ch_shared",
        livemode: false,
        currency: "usd",
        captured: true,
        payment_intent: "pi_test",
        transfer_group: "group_pi_test",
      }),
    },
  } as unknown as ReturnType<typeof financeStripeClient>);
});

it("recovers only the native order cancellation after a total refund", async () => {
  const { current } = refundedPurchase();
  expect(current.view.finance.cancellation).toMatchObject({
    allowed: true,
    refund_amount: 0,
  });
  const inspected = await inspectFinanceRecovery(container, input);
  expect(inspected.prepared.kind).toBe("cancellation");
  expect(inspected.plan.actions).toEqual(["cancel_order"]);
  expect(inspected.plan.observation).toMatchObject({
    payment_id: "pay_shared",
    capture_id: "cap_shared",
    native_refund_ids: ["ref_full"],
    provider_refund_ids: ["re_full"],
  });
  expect(prepareSettlement).toHaveBeenCalledWith(
    expect.objectContaining({ refunded: 70, amount: 0 }),
  );
  expect(inspectAuthorizationRecovery).not.toHaveBeenCalled();
});

it("permits verified fence cleanup when the cancellation already completed", async () => {
  const { order, operation } = refundedPurchase();
  order.status = "canceled";
  operation.state = "complete";
  const inspected = await inspectFinanceRecovery(container, input);
  expect(inspected.prepared.kind).toBe("cancellation");
  expect(inspected.plan.actions).toEqual([]);
});

it("keeps incomplete order cancellation blocked if the journal says complete", async () => {
  const { operation } = refundedPurchase();
  operation.state = "complete";
  await expect(inspectFinanceRecovery(container, input)).rejects.toThrow(
    "Una operación completa tiene pasos faltantes",
  );
});

it("preserves authorization recovery for cancellation before any capture", async () => {
  const { payment } = refundedPurchase();
  payment.captures = [];
  payment.refunds = [];
  jest.mocked(inspectAuthorizationRecovery).mockResolvedValue({
    kind: "authorization",
    result: { order_id: "order_1" },
    actions: [],
  } as unknown as Awaited<ReturnType<typeof inspectAuthorizationRecovery>>);
  await inspectFinanceRecovery(container, input);
  expect(inspectAuthorizationRecovery).toHaveBeenCalled();
  expect(readFinanceProvider).not.toHaveBeenCalled();
});

it.each([
  "partial_refund",
  "missing_native_refund",
  "missing_transaction",
  "missing_credit",
  "active_fulfillment",
  "money_attempted",
])("refuses unsafe cancellation recovery: %s", async (scenario) => {
  const { order, payment, prior, operation } = refundedPurchase();
  if (scenario === "partial_refund") prior.result.amount = 20;
  if (scenario === "missing_native_refund") payment.refunds = [];
  if (scenario === "missing_transaction") order.transactions.pop();
  if (scenario === "missing_credit") order.credit_lines = [];
  if (scenario === "active_fulfillment")
    order.fulfillments = [{ id: "ful_active", canceled_at: null }];
  if (scenario === "money_attempted") operation.result.refund_attempted = true;
  await expect(inspectFinanceRecovery(container, input)).rejects.toThrow();
  expect(prepareSettlement).not.toHaveBeenCalled();
});

it("rejects provider refunds attributed to a different order", async () => {
  const { provider } = refundedPurchase();
  provider.refunds[0].metadata!.order_id = "order_2";
  await expect(inspectFinanceRecovery(container, input)).rejects.toThrow(
    "atribución verificada",
  );
  expect(prepareSettlement).not.toHaveBeenCalled();
});

it("requires the previous seller settlement to remain verified", async () => {
  const { prior } = refundedPurchase();
  prior.result.settlement.commission_returned = 4;
  await expect(inspectFinanceRecovery(container, input)).rejects.toThrow(
    "Los ajustes no coinciden con el derecho original de la tienda",
  );
});
