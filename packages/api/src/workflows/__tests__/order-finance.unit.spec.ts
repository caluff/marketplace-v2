import { asValue } from "@medusajs/framework/awilix";
import { cancelOrderWorkflow } from "@medusajs/core-flows";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { financeGroup } from "../../lib/order-finance/__tests__/fixtures";
import {
  financeOperationSchema,
  financeView,
  initialAllocation,
  type FinanceOperation,
} from "../../lib/order-finance/policy";
import { readOrderFinance } from "../../lib/order-finance/read";
import {
  assertProviderBalances,
  readFinanceProvider,
} from "../../lib/order-finance/provider";
import {
  cancelSharedAuthorizationWorkflow,
  closeSharedCollectionWorkflow,
  createOrderCreditLinesWorkflow,
  recordAllocatedRefundWorkflow,
  refundAllocatedPaymentWorkflow,
} from "../order-finance-native";
import {
  operateOrderFinance,
  type OperateOrderFinanceInput,
} from "../steps/operate-order-finance";
import {
  prepareSettlement,
  reverseSettlement,
} from "../../lib/order-finance/settlement";
jest.mock("../../lib/order-finance/settlement", () => ({
  prepareSettlement: jest.fn(),
  reverseSettlement: jest.fn(),
}));

jest.mock("@medusajs/core-flows", () => ({ cancelOrderWorkflow: jest.fn() }));
jest.mock("../../lib/order-finance/read", () => ({
  readOrderFinance: jest.fn(),
}));
jest.mock("../../lib/order-finance/provider", () => ({
  readFinanceProvider: jest.fn(),
  assertProviderBalances: jest.fn(),
}));
jest.mock("../order-finance-native", () => ({
  cancelSharedAuthorizationWorkflow: jest.fn(),
  closeSharedCollectionWorkflow: jest.fn(),
  createOrderCreditLinesWorkflow: jest.fn(),
  recordAllocatedRefundWorkflow: jest.fn(),
  refundAllocatedPaymentWorkflow: jest.fn(),
}));

const REQUEST_ID = "d8e46278-a58c-4ab1-bfef-ed87edacbd1c";
type ReadResult = Awaited<ReturnType<typeof readOrderFinance>>;
type Operation = Pick<
  ReadResult["operations"][number],
  "id" | "state" | "result" | "created_at"
>;

function fixture() {
  const container = createMedusaContainer();
  const group = financeGroup();
  const allocation = initialAllocation(group);
  const payment = group.orders[0].cart.payment_collection.payments[0];
  const operations: Operation[] = [];
  const state = { active_token: null as string | null, review_required: false };
  let lockTail = Promise.resolve();
  const execute = jest.fn((_key: string, callback: () => Promise<unknown>) => {
    const next = lockTail.then(callback);
    lockTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  });
  container.register({ locking: asValue({ execute }) });
  const journal = {
    claimGroup: jest.fn(async () => {
      if (state.active_token || state.review_required) return null;
      state.active_token = "token_owned";
      return { id: group.id, active_token: state.active_token };
    }),
    releaseGroup: jest.fn(async () => {
      state.active_token = null;
    }),
    observeGroup: jest.fn(
      async (
        _id: string,
        _token: string,
        _observation: unknown,
        review: boolean,
      ) => {
        state.review_required = review;
      },
    ),
    claimOperation: jest.fn(
      async (input: {
        kind: "cancel" | "refund";
        targetId: string;
        result: FinanceOperation;
      }) => {
        const operation: Operation = {
          id: `${input.kind}:${input.targetId}`,
          state: "processing",
          result: input.result,
          created_at: new Date("2026-09-12T12:00:00Z"),
        };
        if (operations.some((item) => item.id === operation.id)) return null;
        operations.push(operation);
        return operation;
      },
    ),
    updateCommerceOperations: jest.fn(async () => undefined),
    finishOperation: jest.fn(
      async (
        id: string,
        _token: string,
        status: Operation["state"],
        result: FinanceOperation,
      ) => {
        const operation = operations.find((item) => item.id === id);
        if (!operation) throw new Error("Unknown operation");
        operation.state = status;
        operation.result = result;
      },
    ),
  };
  jest
    .mocked(readOrderFinance)
    .mockImplementation(async (_container, orderId, _actor, token) => {
      const history = operations
        .filter(
          (operation) =>
            financeOperationSchema.parse(operation.result).order_id === orderId,
        )
        .map((operation) => {
          const value = financeOperationSchema.parse(operation.result);
          return {
            id: operation.id,
            kind: value.action,
            amount: Number(value.amount),
            status: operation.state,
            note: value.note,
            created_at: operation.created_at.toISOString(),
          };
        });
      const view = financeView({
        group,
        orderId,
        allocation,
        history,
        knownRefundIds: operations
          .filter((operation) => operation.state === "complete")
          .flatMap(
            (operation) =>
              financeOperationSchema.parse(operation.result).refund_ids,
          ),
        isHeld:
          state.review_required ||
          Boolean(state.active_token && state.active_token !== token),
        hasPayout: false,
      });
      return {
        group,
        allocation,
        operations,
        journal,
        state,
        view,
      } as unknown as ReadResult;
    });
  const providerRefunds: { id: string; amount: number }[] = [];
  const provider = { status: "succeeded" };
  jest.mocked(readFinanceProvider).mockImplementation(
    async () =>
      ({
        intent: {
          status: provider.status,
          amount_received: payment.captures.length ? 15000 : 0,
        },
        refunds: [...providerRefunds],
      }) as unknown as Awaited<ReturnType<typeof readFinanceProvider>>,
  );
  const refund = jest.fn(
    async ({
      input,
    }: {
      input: { amount: number; metadata: Record<string, string> };
    }) => {
      const currentPayment =
        group.orders[0].cart.payment_collection.payments[0];
      const created = {
        id: `ref_${currentPayment.refunds.length + 1}`,
        amount: input.amount,
        metadata: input.metadata,
      };
      // Native workflows return fresh entities instead of mutating the pre-refund snapshot.
      const updated = {
        ...currentPayment,
        refunds: [...currentPayment.refunds, created],
      };
      group.orders[0].cart.payment_collection.payments[0] = updated;
      providerRefunds.push({
        id: `re_${providerRefunds.length + 1}`,
        amount: input.amount * 100,
      });
      return { result: updated };
    },
  );
  const record = jest.fn(async () => undefined);
  const credit = jest.fn(async () => undefined);
  const cancel = jest.fn(async () => undefined);
  const cancelAuthorization = jest.fn(async () => {
    provider.status = "canceled";
  });
  const closeCollection = jest.fn(async () => undefined);
  jest
    .mocked(refundAllocatedPaymentWorkflow)
    .mockReturnValue({ run: refund } as unknown as ReturnType<
      typeof refundAllocatedPaymentWorkflow
    >);
  jest
    .mocked(recordAllocatedRefundWorkflow)
    .mockReturnValue({ run: record } as unknown as ReturnType<
      typeof recordAllocatedRefundWorkflow
    >);
  jest
    .mocked(createOrderCreditLinesWorkflow)
    .mockReturnValue({ run: credit } as unknown as ReturnType<
      typeof createOrderCreditLinesWorkflow
    >);
  jest
    .mocked(cancelOrderWorkflow)
    .mockReturnValue({ run: cancel } as unknown as ReturnType<
      typeof cancelOrderWorkflow
    >);
  jest
    .mocked(cancelSharedAuthorizationWorkflow)
    .mockReturnValue({ run: cancelAuthorization } as unknown as ReturnType<
      typeof cancelSharedAuthorizationWorkflow
    >);
  jest
    .mocked(closeSharedCollectionWorkflow)
    .mockReturnValue({ run: closeCollection } as unknown as ReturnType<
      typeof closeSharedCollectionWorkflow
    >);
  const input: OperateOrderFinanceInput = {
    order_id: "order_1",
    actor_id: "actor_1",
    seller_id: "seller_1",
    action: "refund",
    amount: 20,
    note: "Ajuste solicitado",
    confirm: true,
    request_id: REQUEST_ID,
  };
  return {
    container,
    group,
    payment,
    state,
    operations,
    journal,
    execute,
    provider,
    refund,
    record,
    credit,
    cancel,
    cancelAuthorization,
    closeCollection,
    input,
    run: (change: Partial<OperateOrderFinanceInput> = {}) =>
      operateOrderFinance(container, { ...input, ...change }),
  };
}

describe("order finance orchestration", () => {
  beforeEach(() => jest.resetAllMocks());

  it("recovers the seller net before refunding the buyer and journals the commission", async () => {
    const test = fixture();
    const settlement = {
      payout_id: "pout_1",
      transfer_id: "tr_1",
      destination: "acct_1",
      gross: 70,
      seller_net: 63,
      seller_reversed: 18,
      commission_returned: 2,
    };
    jest.mocked(prepareSettlement).mockResolvedValue(settlement);
    jest
      .mocked(reverseSettlement)
      .mockResolvedValue({ ...settlement, reversal_id: "trr_1" });
    await test.run();
    expect(
      jest.mocked(reverseSettlement).mock.invocationCallOrder[0],
    ).toBeLessThan(test.refund.mock.invocationCallOrder[0]);
    expect(
      test.journal.updateCommerceOperations.mock.invocationCallOrder[0],
    ).toBeLessThan(test.refund.mock.invocationCallOrder[0]);
    expect(test.operations[0]).toMatchObject({
      state: "complete",
      result: {
        settlement: {
          reversal_id: "trr_1",
          seller_reversed: 18,
          commission_returned: 2,
        },
      },
    });
    await test.run();
    expect(reverseSettlement).toHaveBeenCalledTimes(1);
    expect(test.refund).toHaveBeenCalledTimes(1);
  });

  it.each(["reversal", "refund after reversal"])(
    "freezes an uncertain %s without repeating money",
    async (mode) => {
      const test = fixture();
      const settlement = {
        payout_id: "pout_1",
        transfer_id: "tr_1",
        destination: "acct_1",
        gross: 70,
        seller_net: 63,
        seller_reversed: 18,
        commission_returned: 2,
      };
      jest.mocked(prepareSettlement).mockResolvedValue(settlement);
      if (mode === "reversal")
        jest
          .mocked(reverseSettlement)
          .mockRejectedValue(new Error("Lost response"));
      else {
        jest
          .mocked(reverseSettlement)
          .mockResolvedValue({ ...settlement, reversal_id: "trr_1" });
        test.refund.mockRejectedValue(new Error("Lost refund response"));
      }
      await expect(test.run()).rejects.toThrow("conciliación");
      expect(test.state.review_required).toBe(true);
      expect(test.operations[0].state).toBe("uncertain");
      if (mode === "reversal") expect(test.refund).not.toHaveBeenCalled();
      else
        expect(test.operations[0].result).toMatchObject({
          settlement: { reversal_id: "trr_1" },
        });
      await expect(test.run()).rejects.toThrow("conciliación");
      expect(reverseSettlement).toHaveBeenCalledTimes(1);
    },
  );

  it.each([20, 70])(
    "refunds %s display units only for the selected order and records accounting after provider verification",
    async (amount) => {
      const test = fixture();
      await test.run({ amount });
      expect(test.refund).toHaveBeenCalledTimes(1);
      expect(test.refund).toHaveBeenCalledWith({
        input: {
          payment_id: "pay_shared",
          amount,
          created_by: "actor_1",
          note: "Ajuste solicitado",
          metadata: {
            order_id: "order_1",
            finance_operation_id: `refund:order_1:${REQUEST_ID}`,
          },
        },
      });
      expect(test.record).toHaveBeenCalledWith({
        input: {
          order_id: "order_1",
          amount: -amount,
          currency_code: "usd",
          reference_id: "ref_1",
          reference: "refund",
        },
      });
      expect(test.credit).toHaveBeenCalledWith({
        input: {
          id: "order_1",
          credit_lines: [
            { amount, reference: "refund", reference_id: "ref_1" },
          ],
        },
      });
      expect(assertProviderBalances).toHaveBeenNthCalledWith(
        2,
        expect.any(Object),
        150,
        amount,
        undefined,
      );
      expect(
        test.record.mock.invocationCallOrder[
          test.record.mock.invocationCallOrder.length - 1
        ],
      ).toBeGreaterThan(
        jest.mocked(assertProviderBalances).mock.invocationCallOrder[1],
      );
      expect(test.operations[0]).toMatchObject({
        state: "complete",
        result: { amount, refund_ids: ["ref_1"] },
      });
      expect(test.state.active_token).toBeNull();
      expect(test.cancel).not.toHaveBeenCalled();
    },
  );

  it.each([70.01, 150, 0.001])(
    "rejects over-refunds or fractional cents (%s) before reserving or calling the provider",
    async (amount) => {
      const test = fixture();
      await expect(test.run({ amount })).rejects.toThrow();
      expect(test.journal.claimOperation).not.toHaveBeenCalled();
      expect(readFinanceProvider).not.toHaveBeenCalled();
      expect(test.refund).not.toHaveBeenCalled();
      expect(test.journal.releaseGroup).toHaveBeenCalledTimes(1);
    },
  );

  it("replays a completed stable request ID without another money or accounting call", async () => {
    const test = fixture();
    const first = await test.run();
    expect(await test.run()).toEqual(first);
    expect(test.refund).toHaveBeenCalledTimes(1);
    expect(test.credit).toHaveBeenCalledTimes(1);
    expect(test.journal.claimGroup).toHaveBeenCalledTimes(1);
  });

  it.each([
    { amount: 21 },
    { note: "Otro motivo" },
    { actor_id: "actor_2" },
    { seller_id: "seller_2" },
  ])(
    "rejects stable request ID reuse with different input %j",
    async (change) => {
      const test = fixture();
      await test.run();
      await expect(test.run(change)).rejects.toThrow("otros datos");
      expect(test.refund).toHaveBeenCalledTimes(1);
    },
  );

  it("serializes duplicate concurrent calls by the shared cart and makes one money call", async () => {
    const test = fixture();
    const [first, second] = await Promise.all([test.run(), test.run()]);
    expect(first).toEqual(second);
    expect(test.execute).toHaveBeenCalledTimes(2);
    expect(test.execute).toHaveBeenCalledWith(
      "cart_shared",
      expect.any(Function),
      { timeout: 5 },
    );
    expect(test.refund).toHaveBeenCalledTimes(1);
    expect(test.operations).toHaveLength(1);
  });

  it("rejects a concurrent durable claim even if the distributed lock admits a request", async () => {
    const test = fixture();
    test.journal.claimGroup.mockResolvedValue(null);
    await expect(test.run()).rejects.toThrow("otra operación");
    expect(test.refund).not.toHaveBeenCalled();
    expect(test.journal.releaseGroup).not.toHaveBeenCalled();
  });

  it("serializes different sellers on the same payment without consuming each other's allocation", async () => {
    const test = fixture();
    const [first, second] = await Promise.all([
      test.run({ amount: 70 }),
      test.run({
        order_id: "order_2",
        seller_id: "seller_2",
        amount: 80,
        request_id: "2a96531b-ec99-4467-b72b-a1da715aaf76",
      }),
    ]);
    expect(first.finance).toMatchObject({
      order_id: "order_1",
      refunded_total: 70,
      refundable_total: 0,
    });
    expect(second.finance).toMatchObject({
      order_id: "order_2",
      refunded_total: 80,
      refundable_total: 0,
    });
    expect(
      test.refund.mock.calls.map(([request]) => request.input.amount),
    ).toEqual([70, 80]);
    expect(assertProviderBalances).toHaveBeenNthCalledWith(
      3,
      expect.any(Object),
      150,
      70,
      undefined,
    );
    expect(assertProviderBalances).toHaveBeenNthCalledWith(
      4,
      expect.any(Object),
      150,
      150,
      undefined,
    );
    expect(test.operations.map((operation) => operation.state)).toEqual([
      "complete",
      "complete",
    ]);
  });

  it("releases an unreserved duplicate operation claim without making a money call", async () => {
    const test = fixture();
    test.journal.claimOperation.mockResolvedValue(null);
    await expect(test.run()).rejects.toThrow("ya está registrada");
    expect(test.refund).not.toHaveBeenCalled();
    expect(test.record).not.toHaveBeenCalled();
    expect(test.journal.releaseGroup).toHaveBeenCalledTimes(1);
    expect(test.state.review_required).toBe(false);
  });

  it("rejects a refund of an uncharged authorization before consulting the provider", async () => {
    const test = fixture();
    test.payment.captures = [];
    await expect(test.run()).rejects.toThrow("autorizado");
    expect(readFinanceProvider).not.toHaveBeenCalled();
    expect(test.refund).not.toHaveBeenCalled();
    expect(test.credit).not.toHaveBeenCalled();
  });

  it("fences a refund with missing native attribution instead of crediting an unrelated refund", async () => {
    const test = fixture();
    test.refund.mockResolvedValue({
      result: {
        ...test.payment,
        refunds: [{ id: "ref_unattributed", amount: 20, metadata: {} }],
      },
    });
    await expect(test.run()).rejects.toThrow("conciliación");
    expect(test.credit).not.toHaveBeenCalled();
    expect(test.record).toHaveBeenCalledTimes(1);
    expect(test.state.review_required).toBe(true);
    await expect(test.run()).rejects.toThrow("conciliación");
    expect(test.refund).toHaveBeenCalledTimes(1);
  });

  it("leaves an uncertain fence after a failed refund and prevents retries with both old and new IDs", async () => {
    const test = fixture();
    test.group.orders[0].transactions = [
      {
        id: "tx_capture",
        reference: "capture",
        reference_id: "cap_shared",
        amount: 70,
      },
    ];
    test.refund.mockRejectedValue(
      new Error("Provider connection closed after submitting refund"),
    );
    await expect(test.run()).rejects.toThrow("conciliación");
    expect(test.operations[0].state).toBe("uncertain");
    expect(test.state).toEqual({
      active_token: "token_owned",
      review_required: true,
    });
    await expect(test.run()).rejects.toThrow("conciliación");
    await expect(
      test.run({ request_id: "2a96531b-ec99-4467-b72b-a1da715aaf76" }),
    ).rejects.toThrow();
    expect(test.refund).toHaveBeenCalledTimes(1);
    expect(test.record).not.toHaveBeenCalled();
    expect(test.credit).not.toHaveBeenCalled();
    expect(test.cancel).not.toHaveBeenCalled();
    expect(test.journal.releaseGroup).not.toHaveBeenCalled();
  });

  it("does not record a refund or credit when native refund fails on an order without capture accounting", async () => {
    const test = fixture();
    test.refund.mockRejectedValue(new Error("Provider refused refund"));
    await expect(test.run()).rejects.toThrow("conciliación");
    expect(test.record.mock.calls).toEqual([
      [
        {
          input: {
            order_id: "order_1",
            amount: 70,
            currency_code: "usd",
            reference: "capture",
            reference_id: "cap_shared",
          },
        },
      ],
    ]);
    expect(test.credit).not.toHaveBeenCalled();
  });

  it("fences ambiguous provider verification before refund accounting or cancellation", async () => {
    const test = fixture();
    jest
      .mocked(assertProviderBalances)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("Provider totals mismatch");
      });
    await expect(
      test.run({ action: "cancel", amount: undefined }),
    ).rejects.toThrow("conciliación");
    expect(test.refund).toHaveBeenCalledTimes(1);
    expect(test.record).toHaveBeenCalledTimes(1);
    expect(test.credit).not.toHaveBeenCalled();
    expect(test.cancel).not.toHaveBeenCalled();
    expect(test.state.review_required).toBe(true);
  });

  it("does not retry money when later accounting fails", async () => {
    const test = fixture();
    test.credit.mockRejectedValue(new Error("Accounting unavailable"));
    await expect(test.run()).rejects.toThrow("conciliación");
    await expect(test.run()).rejects.toThrow("conciliación");
    expect(test.refund).toHaveBeenCalledTimes(1);
    expect(test.operations[0]).toMatchObject({
      state: "uncertain",
      result: { refund_ids: ["ref_1"] },
    });
  });

  it("subtracts an existing amount owed before creating a credit line", async () => {
    const test = fixture();
    test.group.orders[0].summary = { pending_difference: -12 };
    await test.run();
    expect(test.credit).toHaveBeenCalledWith({
      input: {
        id: "order_1",
        credit_lines: [
          { amount: 8, reference: "refund", reference_id: "ref_1" },
        ],
      },
    });
  });

  it.each([false, true])(
    "cancels an uncharged order and closes shared authorization only if every seller is canceled (%s)",
    async (lastOrder) => {
      const test = fixture();
      test.payment.captures = [];
      test.provider.status = "requires_capture";
      if (lastOrder) test.group.orders[1].status = "canceled";
      await test.run({ action: "cancel", amount: undefined });
      expect(test.cancel).toHaveBeenCalledWith({
        input: { order_id: "order_1", canceled_by: "actor_1" },
      });
      expect(test.refund).not.toHaveBeenCalled();
      expect(test.record).not.toHaveBeenCalled();
      expect(test.credit).not.toHaveBeenCalled();
      expect(test.cancelAuthorization).toHaveBeenCalledTimes(lastOrder ? 1 : 0);
      expect(test.closeCollection).toHaveBeenCalledTimes(lastOrder ? 1 : 0);
    },
  );

  it("checks native cancellation eligibility before money calls", async () => {
    const test = fixture();
    test.group.orders[0].fulfillments = [{ id: "ful_open", canceled_at: null }];
    await expect(
      test.run({ action: "cancel", amount: undefined }),
    ).rejects.toThrow("preparaciones");
    expect(test.refund).not.toHaveBeenCalled();
    expect(test.cancel).not.toHaveBeenCalled();
  });
});
