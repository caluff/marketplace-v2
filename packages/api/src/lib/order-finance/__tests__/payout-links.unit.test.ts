import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../../../modules/commerce-automation";
import { readOrderFinance } from "../read";
import { financeGroup, originalSales } from "./fixtures";

jest.mock("@mercurjs/core/api/vendor/orders/helpers", () => ({
  validateSellerOrder: jest.fn(),
}));

const reason =
  "La liquidación de esta tienda requiere conciliación antes del reembolso.";

async function readWithPayout(payout: unknown) {
  const group = financeGroup();
  group.orders[0].customer_id = "cus_owner";
  group.orders[0].cart.payment_collection.status = "authorized";
  group.orders[0].cart.payment_collection.payments[0].captures = [];
  const graph = jest.fn(async (input: { entity: string }) => ({
    data:
      input.entity === "order"
        ? [{ id: "order_1", customer_id: "cus_owner" }]
        : input.entity === "order_group_order"
          ? [{ order_group_id: group.id }]
          : input.entity === "order_group"
            ? [group]
            : input.entity === "payout_seller"
              ? [{ seller_id: "seller_1", payout }]
              : [],
  }));
  const journal = {
    listCommerceGroupStates: jest.fn().mockResolvedValue([]),
    listCommerceOperations: jest.fn().mockResolvedValue([]),
    listFinanceSaleSnapshots: jest
      .fn()
      .mockResolvedValue(
        originalSales(group).map((original) => ({ original })),
      ),
  };
  const container = {
    resolve: (key: string) =>
      key === COMMERCE_AUTOMATION_MODULE
        ? journal
        : key === ContainerRegistrationKeys.QUERY
          ? { graph }
          : { warn: jest.fn() },
  } as unknown as MedusaContainer;
  return readOrderFinance(container, "order_1", {
    actor_id: "cus_owner",
    customer_id: "cus_owner",
  });
}

it.each([null, undefined])(
  "does not block an unprepared buyer order for an orphan payout link (%s)",
  async (payout) => {
    const current = await readWithPayout(payout);
    expect(current.financialProblem).toBeNull();
    expect(current.payout).toBeUndefined();
    expect(current.view.finance.captured_total).toBe(0);
    expect(current.view.finance.history).toEqual([]);
    expect(current.view.finance.cancellation).toMatchObject({
      allowed: true,
      refund_amount: 0,
    });
  },
);

it("still blocks a real payout with malformed settlement data", async () => {
  const current = await readWithPayout({
    id: "pout_malformed",
    data: { metadata: { seller_id: "seller_1", order_id: "order_1" } },
  });
  expect(current.financialProblem).toBe(reason);
  expect(current.view.finance.cancellation).toMatchObject({
    allowed: false,
    reason,
  });
});

it("still blocks a real transfer without an attributable order identity", async () => {
  const current = await readWithPayout({
    id: "pout_unallocated",
    amount: 64.4,
    currency_code: "usd",
    status: "paid",
    account_id: "pacc_1",
    account: { id: "pacc_1", data: { id: "acct_1" } },
    data: {
      id: "tr_shared",
      transfer_group: "group_shared",
      destination: "acct_1",
      livemode: false,
      metadata: { seller_id: "seller_1" },
    },
  });
  expect(current.financialProblem).toBe(reason);
  expect(current.view.finance.cancellation).toMatchObject({
    allowed: false,
    reason,
  });
});
