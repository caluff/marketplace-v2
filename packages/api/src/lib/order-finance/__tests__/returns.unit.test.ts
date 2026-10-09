import type { MedusaContainer } from "@medusajs/framework/types";
import { financeGroup } from "./fixtures";
import { financeView, initialAllocation } from "../policy";
import { readOrderFinance } from "../read";
import {
  assertMarketplaceReturnFinance,
  assertCustomerReturnMetadataIsReadOnly,
  readCustomerReturns,
} from "../returns";
import { customerReturnInputSchema } from "../contracts";

jest.mock("../read", () => ({ readOrderFinance: jest.fn() }));
jest.mock("../../../workflows/validate-cart-ownership", () => ({
  validateCartOwnershipWorkflow: () => ({
    run: jest.fn().mockResolvedValue({}),
  }),
}));

const read = jest.mocked(readOrderFinance);
const graph = jest.fn();
const container = { resolve: () => ({ graph }) } as unknown as MedusaContainer;
function current() {
  const group = financeGroup();
  group.orders[0].transactions = [
    {
      id: "tx_capture",
      reference: "capture",
      reference_id: "cap_shared",
      amount: 70,
    },
  ];
  const allocation = initialAllocation(group);
  const view = financeView({
    group,
    orderId: "order_1",
    allocation,
    history: [],
    knownRefundIds: [],
    isHeld: false,
    hasPayout: false,
  });
  return {
    group,
    allocation,
    view,
    operations: [],
    state: undefined,
    finalCapture: undefined,
    financialProblem: null,
    hasPendingChanges: false,
  } as unknown as Awaited<ReturnType<typeof readOrderFinance>>;
}
beforeEach(() => {
  jest.clearAllMocks();
  read.mockResolvedValue(current());
});

it.each([
  null,
  { usapeek_customer_return: null },
  { usapeek_customer_return: "" },
  { usapeek_customer_return: { customer_id: "cus_forged" } },
])("protects the buyer request identity from native metadata writes: %p", (metadata) => {
  expect(() => assertCustomerReturnMetadataIsReadOnly(metadata)).toThrow(
    "no se pueden modificar",
  );
});

it("permits native metadata merges outside the buyer's reserved audit block", () => {
  for (const metadata of [undefined, {}, { tracking_reference: "return_1" }])
    expect(() => assertCustomerReturnMetadataIsReadOnly(metadata)).not.toThrow();
});

it("allows native returns only once the store capture is accounted, including a negative native return balance", async () => {
  const value = current();
  value.group.orders[0].summary!.pending_difference = -20;
  value.hasPendingChanges = true;
  read.mockResolvedValue(value);
  await expect(
    assertMarketplaceReturnFinance(container, "order_1", {
      actor_id: "user_1",
    }),
  ).resolves.toBe(value);
});

it.each([
  "capture_missing",
  "capture_foreign",
  "unpaid",
  "extra_balance",
  "held",
  "financial_problem",
])("blocks incompatible native return: %s", async (scenario) => {
  const value = current();
  const order = value.group.orders[0];
  if (scenario === "capture_missing") order.transactions = [];
  if (scenario === "capture_foreign")
    order.transactions[0].reference_id = "cap_foreign";
  if (scenario === "unpaid")
    order.cart.payment_collection.payments[0].captures = [];
  if (scenario === "extra_balance") order.summary!.pending_difference = 5;
  if (scenario === "held")
    value.state = {
      active_token: "other",
      review_required: false,
    } as NonNullable<typeof value.state>;
  if (scenario === "financial_problem")
    value.financialProblem = "Original financiero no verificable";
  read.mockResolvedValue(value);
  await expect(
    assertMarketplaceReturnFinance(container, "order_1", {
      actor_id: "user_1",
    }),
  ).rejects.toThrow();
});

it("permits finishing logistics after a complete refund without opening a second charge", async () => {
  const value = current();
  value.group.orders[0].summary!.pending_difference = -70;
  const payment = value.group.orders[0].cart.payment_collection.payments[0];
  payment.refunds = [{ id: "ref_1", amount: 70, metadata: {} }];
  value.view.finance.history = [
    {
      id: "op",
      kind: "refund",
      amount: 70,
      status: "complete",
      note: "Complete",
      created_at: "2026-10-07T00:00:00Z",
    },
  ];
  value.operations = [
    {
      state: "complete",
      result: {
        order_id: "order_1",
        action: "refund",
        amount: 70,
        note: "Complete",
        request_id: "755f0a82-7cf6-4195-b833-825c955918dc",
        fingerprint: "f",
        refund_ids: ["ref_1"],
      },
    },
  ] as unknown as typeof value.operations;
  read.mockResolvedValue(value);
  await expect(
    assertMarketplaceReturnFinance(container, "order_1", {
      actor_id: "user_1",
    }),
  ).resolves.toBe(value);
  payment.refunds[0].id = "ref_foreign";
  await expect(
    assertMarketplaceReturnFinance(container, "order_1", {
      actor_id: "user_1",
    }),
  ).rejects.toThrow("sin asignar");
});

it("subtracts prior received and damaged units and exposes only public warehouse instructions", async () => {
  graph.mockImplementation(async ({ entity }: { entity: string }) => ({
    data:
      entity === "order"
        ? [
            {
              id: "order_1",
              customer_id: "cus_owner",
              items: [
                {
                  id: "item_1",
                  title: "Producto",
                  detail: {
                    shipped_quantity: 5,
                    return_requested_quantity: 1,
                    return_received_quantity: 1,
                    return_dismissed_quantity: 1,
                  },
                },
              ],
            },
          ]
        : entity === "return"
          ? [
              {
                id: "ret_store",
                status: "requested",
                requested_at: new Date(),
                canceled_at: null,
                location_id: "loc_1",
                metadata: { internal_note: "Private operator note" },
              },
            ]
          : [
              {
                id: "loc_1",
                name: "Tienda",
                address: {
                  address_1: "100 Main",
                  city: "Miami",
                  country_code: "us",
                },
              },
            ],
  }));
  const result = await readCustomerReturns(container, "order_1", "cus_owner");
  expect(result.items[0].available_quantity).toBe(2);
  expect(result.requests[0]).toMatchObject({
    reason: "store_return",
    status: "approved",
    destination: "Tienda, 100 Main, Miami, US",
  });
  expect(JSON.stringify(result)).not.toContain("Private operator note");
  expect(read).toHaveBeenCalledWith(
    container,
    "order_1",
    { actor_id: "cus_owner", customer_id: "cus_owner" },
    undefined,
  );
});

it("keeps a discarded native draft canceled without exposing its former destination or internal note", async () => {
  graph.mockImplementation(async ({ entity }: { entity: string }) => ({
    data:
      entity === "order"
        ? [{ customer_id: "cus_owner", items: [] }]
        : [
            {
              id: "return_discarded",
              status: "open",
              requested_at: new Date(),
              deleted_at: new Date(),
              location_id: "loc_private",
              metadata: { internal_note: "Private operator note" },
            },
          ],
  }));
  const result = await readCustomerReturns(container, "order_1", "cus_owner");
  expect(result.requests).toEqual([
    {
      id: "return_discarded",
      status: "canceled",
      reason: "store_return",
      note: "Devolución gestionada por la tienda.",
      destination: null,
    },
  ]);
  expect(graph).toHaveBeenCalledTimes(2);
});

it("rejects native financial controls, duplicate items and unconfirmed buyer requests", () => {
  const input = {
    request_id: "755f0a82-7cf6-4195-b833-825c955918dc",
    reason: "damaged",
    note: "Artículo dañado",
    items: [{ id: "item_1", quantity: 1 }],
    confirm: true,
  };
  expect(customerReturnInputSchema.safeParse(input).success).toBe(true);
  for (const mutation of [
    { ...input, receive_now: true },
    { ...input, refund_amount: 70 },
    { ...input, items: [...input.items, ...input.items] },
    { ...input, confirm: false },
  ]) {
    expect(customerReturnInputSchema.safeParse(mutation).success).toBe(false);
  }
});
