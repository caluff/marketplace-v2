import { createMedusaContainer } from "@medusajs/framework/utils";
import { financeGroup } from "../../lib/order-finance/__tests__/fixtures";
import { initialAllocation } from "../../lib/order-finance/policy";
import {
  assertProviderBalances,
  financeStripeClient,
  readFinanceProvider,
} from "../../lib/order-finance/provider";
import {
  recordAllocatedRefundWorkflow,
  recordFinalCaptureWorkflow,
} from "../order-finance-native";
import { performFinalOrderCapture } from "../steps/final-order-capture";

jest.mock("../../lib/order-finance/provider", () => ({
  assertProviderBalances: jest.fn(),
  financeStripeClient: jest.fn(),
  readFinanceProvider: jest.fn(),
}));
jest.mock("../order-finance-native", () => ({
  recordAllocatedRefundWorkflow: jest.fn(),
  recordFinalCaptureWorkflow: jest.fn(),
}));

function fixture() {
  const group = financeGroup();
  group.orders[0].status = "canceled";
  group.orders[0].cart.payment_collection.payments[0].captures = [];
  const allocation = initialAllocation(group);
  const intent = {
    livemode: false,
    status: "succeeded",
    amount_capturable: 0,
    amount_received: 8000,
  };
  const capture = jest.fn(async () => intent);
  jest
    .mocked(financeStripeClient)
    .mockReturnValue({ paymentIntents: { capture } } as unknown as ReturnType<
      typeof financeStripeClient
    >);
  jest.mocked(readFinanceProvider).mockResolvedValue({
    intent,
    refunds: [{ id: "release" }],
  } as unknown as Awaited<ReturnType<typeof readFinanceProvider>>);
  const nativeCapture = jest.fn(async () => ({
    result: { captures: [{ id: "cap_final", amount: 80 }] },
  }));
  const accounting = jest.fn(async () => undefined);
  jest
    .mocked(recordFinalCaptureWorkflow)
    .mockReturnValue({ run: nativeCapture } as unknown as ReturnType<
      typeof recordFinalCaptureWorkflow
    >);
  jest
    .mocked(recordAllocatedRefundWorkflow)
    .mockReturnValue({ run: accounting } as unknown as ReturnType<
      typeof recordAllocatedRefundWorkflow
    >);
  const observeGroup = jest.fn(async () => undefined);
  const current = {
    group,
    allocation,
    view: { finance: { capture: { amount: 80 } } },
    journal: { observeGroup },
  } as unknown as Parameters<typeof performFinalOrderCapture>[1]["current"];
  return {
    intent,
    capture,
    nativeCapture,
    accounting,
    observeGroup,
    run: () =>
      performFinalOrderCapture(createMedusaContainer(), {
        current,
        token: "owner",
        operationId: "capture:order_2:request",
        actorId: "operator",
      }),
  };
}
describe("final capture native integration", () => {
  beforeEach(() => jest.resetAllMocks());
  it("captures exact minor units once, records only verified display units and allocates zero to canceled orders", async () => {
    const test = fixture();
    await test.run();
    expect(test.capture).toHaveBeenCalledWith(
      "pi_test",
      {
        amount_to_capture: 8000,
        metadata: {
          marketplace_final_capture_operation_id: "capture:order_2:request",
        },
      },
      {
        idempotencyKey: "order-finance:capture:order_2:request:single-capture",
      },
    );
    expect(test.nativeCapture).toHaveBeenCalledWith({
      input: {
        payment_id: "pay_shared",
        amount: 80,
        is_captured: true,
        captured_by: "operator",
      },
    });
    expect(test.accounting).toHaveBeenCalledTimes(1);
    expect(test.accounting).toHaveBeenCalledWith({
      input: {
        order_id: "order_2",
        amount: 80,
        currency_code: "usd",
        reference: "capture",
        reference_id: "cap_final",
      },
    });
    expect(assertProviderBalances).toHaveBeenCalledWith(
      expect.any(Object),
      80,
      0,
      ["release"],
    );
    expect(test.observeGroup).toHaveBeenCalledWith(
      "group_shared",
      "owner",
      {
        finance_final_capture: {
          capture_id: "cap_final",
          orders: [
            { order_id: "order_1", amount: 0 },
            { order_id: "order_2", amount: 80 },
          ],
          released_refund_ids: ["release"],
        },
      },
      false,
    );
  });
  it.each(["wrong amount", "still capturable", "live", "pending"])(
    "does not record a fabricated capture when provider is %s",
    async (mode) => {
      const test = fixture();
      if (mode === "wrong amount") test.intent.amount_received = 15000;
      if (mode === "still capturable") test.intent.amount_capturable = 7000;
      if (mode === "live") test.intent.livemode = true;
      if (mode === "pending") test.intent.status = "processing";
      await expect(test.run()).rejects.toThrow();
      expect(test.nativeCapture).not.toHaveBeenCalled();
      expect(test.accounting).not.toHaveBeenCalled();
    },
  );
});
