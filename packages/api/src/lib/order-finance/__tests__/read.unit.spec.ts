import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { validateSellerOrder } from "@mercurjs/core/api/vendor/orders/helpers";
import { COMMERCE_AUTOMATION_MODULE } from "../../../modules/commerce-automation";
import { readOrderFinance } from "../read";
import { financeGroup } from "./fixtures";

jest.mock("@mercurjs/core/api/vendor/orders/helpers", () => ({
  validateSellerOrder: jest.fn(),
}));

function fixture() {
  const container = createMedusaContainer();
  const group = financeGroup();
  const operation = {
    id: "refund:order_1:request",
    group_id: group.id,
    kind: "refund",
    state: "complete",
    created_at: new Date("2026-09-12T12:00:00Z"),
    result: {
      order_id: "order_1",
      action: "refund",
      amount: 20,
      note: "Reembolso parcial",
      request_id: "d8e46278-a58c-4ab1-bfef-ed87edacbd1c",
      fingerprint: "fingerprint",
      refund_ids: ["ref_1"],
    },
  };
  const state = { active_token: null as string | null, review_required: false };
  const payouts: {
    seller_id: string;
    payout: { id: string; status: string; data: { order_id?: string } };
  }[] = [];
  const pendingChanges: { id: string }[] = [];
  const journal = {
    listCommerceGroupStates: jest.fn(async () => [state]),
    listCommerceOperations: jest.fn(async () => [operation]),
  };
  const graph = jest.fn(async ({ entity }: { entity: string }) => {
    switch (entity) {
      case "order_group_order":
        return { data: [{ order_group_id: group.id }] };
      case "order_group":
        return { data: [group] };
      case "payout_seller":
        return { data: payouts };
      case "order_change":
        return { data: pendingChanges };
      default:
        throw new Error(`Unexpected graph entity ${entity}`);
    }
  });
  group.orders[0].cart.payment_collection.payments[0].refunds = [
    { id: "ref_1", amount: 20, metadata: null },
  ];
  container.register({
    query: asValue({ graph }),
    [COMMERCE_AUTOMATION_MODULE]: asValue(journal),
  });
  return {
    container,
    group,
    operation,
    journal,
    graph,
    payouts,
    state,
    pendingChanges,
  };
}

describe("order finance reads", () => {
  beforeEach(() => jest.resetAllMocks());

  it("attributes group refunds to their order while preserving the other seller's full capacity", async () => {
    const test = fixture();
    const first = await readOrderFinance(test.container, "order_1", {
      actor_id: "actor_1",
      seller_id: "seller_1",
    });
    const second = await readOrderFinance(test.container, "order_2", {
      actor_id: "actor_2",
      seller_id: "seller_2",
    });
    expect(first.view.finance).toMatchObject({
      refunded_total: 20,
      refundable_total: 50,
      history: [{ amount: 20 }],
    });
    expect(second.view.finance).toMatchObject({
      refunded_total: 0,
      refundable_total: 80,
      refund: { allowed: true },
      history: [],
    });
    expect(validateSellerOrder).toHaveBeenNthCalledWith(
      2,
      test.container,
      "seller_2",
      "order_2",
    );
    expect(test.graph).toHaveBeenCalledWith(
      expect.objectContaining({ entity: "order_group" }),
      { cache: { enable: false } },
    );
  });

  it("checks seller ownership before reading any financial graph data", async () => {
    const test = fixture();
    jest
      .mocked(validateSellerOrder)
      .mockRejectedValue(new Error("Wrong seller"));
    await expect(
      readOrderFinance(test.container, "order_1", {
        actor_id: "actor_2",
        seller_id: "seller_2",
      }),
    ).rejects.toThrow("Wrong seller");
    expect(test.graph).not.toHaveBeenCalled();
  });

  it.each([{ actor_id: "" }, { actor_id: "actor_1", seller_id: "" }])(
    "rejects missing actor/seller context %j",
    async (actor) => {
      const test = fixture();
      await expect(
        readOrderFinance(test.container, "order_1", actor),
      ).rejects.toThrow();
      expect(test.graph).not.toHaveBeenCalled();
    },
  );

  it("blocks unassigned historical refunds and malformed journal operations", async () => {
    const test = fixture();
    test.operation.result.refund_ids = [];
    expect(
      (
        await readOrderFinance(test.container, "order_2", {
          actor_id: "operator",
        })
      ).view.finance.refund.allowed,
    ).toBe(false);
    test.operation.result.request_id = "invalid";
    expect(
      (
        await readOrderFinance(test.container, "order_2", {
          actor_id: "operator",
        })
      ).view.finance.cancellation.allowed,
    ).toBe(false);
  });

  it("recognizes only the active claim owner's token and never bypasses a review fence", async () => {
    const test = fixture();
    test.state.active_token = "owned";
    const read = (token?: string) =>
      readOrderFinance(
        test.container,
        "order_2",
        { actor_id: "operator" },
        token,
      );
    expect((await read()).view.finance.refund.allowed).toBe(false);
    expect((await read("different")).view.finance.refund.allowed).toBe(false);
    expect((await read("owned")).view.finance.refund.allowed).toBe(true);
    test.state.review_required = true;
    expect((await read("owned")).view.finance.refund.allowed).toBe(false);
  });

  it("blocks prior payouts for the selected order without blocking the other seller", async () => {
    const test = fixture();
    test.payouts.push({
      seller_id: "seller_1",
      payout: {
        id: "payout_1",
        status: "completed",
        data: { order_id: "order_1" },
      },
    });
    expect(
      (
        await readOrderFinance(test.container, "order_1", {
          actor_id: "operator",
        })
      ).view.finance.refund.allowed,
    ).toBe(false);
    expect(
      (
        await readOrderFinance(test.container, "order_2", {
          actor_id: "operator",
        })
      ).view.finance.refund.allowed,
    ).toBe(true);
  });

  it("blocks native pending order changes before the finance operation can proceed", async () => {
    const test = fixture();
    test.pendingChanges.push({ id: "change_pending" });
    const result = await readOrderFinance(test.container, "order_1", {
      actor_id: "operator",
    });
    expect(result.view.finance.refund.allowed).toBe(false);
    expect(result.view.finance.cancellation.allowed).toBe(false);
    expect(test.graph).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "order_change",
        filters: { order_id: ["order_1", "order_2"], status: "pending" },
      }),
      { cache: { enable: false } },
    );
  });
});
