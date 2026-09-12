import {
  prepareSettlement,
  proportionalSettlement,
  reverseSettlement,
  type FinancePayout,
} from "../settlement";
import { financeStripeClient } from "../provider";
jest.mock("../provider", () => ({ financeStripeClient: jest.fn() }));

describe("proportional paid seller refunds", () => {
  it("returns the commission proportionally without rounding drift", () => {
    let seller = 0;
    let commission = 0;
    for (let cents = 0; cents < 1200; cents++) {
      const part = proportionalSettlement(12, 10.79, cents / 100, 0.01);
      seller += Math.round(part.seller_reversed * 100);
      commission += Math.round(part.commission_returned * 100);
    }
    expect(seller).toBe(1079);
    expect(commission).toBe(121);
    expect(proportionalSettlement(12, 10.8, 0, 1)).toEqual({
      seller_reversed: 0.9,
      commission_returned: 0.1,
    });
    expect(proportionalSettlement(12, 10.8, 1, 11)).toEqual({
      seller_reversed: 9.9,
      commission_returned: 1.1,
    });
  });
  it.each([
    [0, 0, 0, 1],
    [12, 13, 0, 1],
    [12, 10, 11, 2],
    [12, -1, 0, 1],
  ])("rejects invalid allocation %j", (g, n, r, a) => {
    expect(() => proportionalSettlement(g, n, r, a)).toThrow();
  });

  function fixture() {
    const payout: FinancePayout = {
      id: "pout_1",
      amount: 10.8,
      currency_code: "usd",
      status: "paid",
      account_id: "pacc_1",
      account: { id: "pacc_1", data: { id: "acct_1" } },
      data: {
        id: "tr_1",
        destination: "acct_1",
        transfer_group: "order_1",
        livemode: false,
        metadata: { seller_id: "seller_1" },
      },
    };
    const transfer = {
      ...payout.data,
      amount: 1080,
      amount_reversed: 0,
      currency: "usd",
    };
    const list = jest.fn(async () => ({ data: [transfer], has_more: false }));
    const listReversals = jest.fn(async () => ({ data: [], has_more: false }));
    const createReversal = jest.fn(async () => ({
      id: "trr_1",
      transfer: "tr_1",
      amount: 90,
      currency: "usd",
      metadata: { finance_operation_id: "refund:1" },
    }));
    jest
      .mocked(financeStripeClient)
      .mockReturnValue({
        transfers: { list, listReversals, createReversal },
      } as unknown as ReturnType<typeof financeStripeClient>);
    return {
      payout,
      transfer,
      list,
      listReversals,
      createReversal,
      input: {
        payout,
        orderId: "order_1",
        sellerId: "seller_1",
        gross: 12,
        refunded: 0,
        amount: 1,
        prior: [],
      },
    };
  }
  it("uses native transfer_group attribution and reverses only net, with a stable key", async () => {
    const test = fixture();
    const plan = await prepareSettlement(test.input);
    expect(test.list).toHaveBeenCalledWith({
      transfer_group: "order_1",
      limit: 100,
    });
    expect(test.createReversal).not.toHaveBeenCalled();
    expect(await reverseSettlement(plan!, "refund:1", "order_1")).toMatchObject(
      { reversal_id: "trr_1", seller_reversed: 0.9, commission_returned: 0.1 },
    );
    expect(test.createReversal).toHaveBeenCalledWith(
      "tr_1",
      {
        amount: 90,
        metadata: { finance_operation_id: "refund:1", order_id: "order_1" },
      },
      { idempotencyKey: "order-finance:refund:1:reversal" },
    );
  });
  it.each([
    "destination",
    "amount",
    "reversed",
    "seller",
    "live",
    "duplicate",
    "orphan",
    "previous refund without reversal",
  ])("rejects unsafe transfer: %s", async (mode) => {
    const test = fixture();
    if (mode === "destination") test.transfer.destination = "acct_other";
    if (mode === "amount") test.transfer.amount = 1200;
    if (mode === "reversed") test.transfer.amount_reversed = 1;
    if (mode === "seller") test.transfer.metadata.seller_id = "other";
    if (mode === "live") Object.assign(test.transfer, { livemode: true });
    if (mode === "duplicate")
      test.list.mockResolvedValue({
        data: [test.transfer, test.transfer],
        has_more: false,
      });
    if (mode === "previous refund without reversal") test.input.refunded = 1;
    await expect(
      prepareSettlement({
        ...test.input,
        payout: mode === "orphan" ? undefined : test.payout,
      }),
    ).rejects.toThrow();
    expect(test.createReversal).not.toHaveBeenCalled();
  });
  it("does not call reversal when all refunded value was platform commission", async () => {
    const test = fixture();
    test.payout.amount = 0;
    test.transfer.amount = 0;
    const plan = await prepareSettlement(test.input);
    await reverseSettlement(plan!, "refund:1", "order_1");
    expect(test.createReversal).not.toHaveBeenCalled();
  });
});
