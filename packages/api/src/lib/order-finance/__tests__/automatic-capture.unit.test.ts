import type { MedusaContainer } from "@medusajs/framework/types";
import { financeView, initialAllocation } from "../policy";
import { financeGroup } from "./fixtures";
import {
  automaticCaptureRequestId,
  capturePreparedPurchase,
} from "../automatic-capture";
import { readOrderFinance } from "../read";
import { operateOrderFinanceWorkflow } from "../../../workflows/operate-order-finance";
import {
  assertAutomaticCaptureSettings,
  parsePaymentCaptureSettings,
} from "../capture-settings";

jest.mock("../read", () => ({ readOrderFinance: jest.fn() }));
jest.mock("../../../workflows/operate-order-finance", () => ({
  operateOrderFinanceWorkflow: jest.fn(),
}));

const revision = "755f0a82-7cf6-4195-b833-825c955918dc";
const store = {
  id: "store_test",
  metadata: {
    usapeek_payment_capture: {
      mode: "automatic",
      revision,
      actor_id: "user_operator",
    },
  },
};
const listStores = jest.fn();
const container = {
  resolve: () => ({ listStores }),
} as unknown as MedusaContainer;
const run = jest.fn();

function preparedPurchase() {
  const group = financeGroup();
  group.orders[0].cart.payment_collection.payments[0].captures = [];
  group.orders[0].cart.payment_collection.status = "authorized";
  for (const order of group.orders) {
    order.items = [{ quantity: 2, detail: { fulfilled_quantity: 2 } }];
    order.fulfillments = [{ id: `ful_${order.id}`, canceled_at: null }];
  }
  return group;
}

function mockPurchase(group = preparedPurchase(), held = false) {
  jest.mocked(readOrderFinance).mockImplementation(
    async (_container, id) =>
      ({
        group,
        view: financeView({
          group,
          orderId: id,
          allocation: initialAllocation(group),
          history: [],
          knownRefundIds: [],
          hasPayout: false,
          payoutProblem: null,
          isOperator: true,
          isHeld: held,
        }),
      }) as Awaited<ReturnType<typeof readOrderFinance>>,
  );
  return group;
}

beforeEach(() => {
  jest.clearAllMocks();
  listStores.mockResolvedValue([structuredClone(store)]);
  jest
    .mocked(operateOrderFinanceWorkflow)
    .mockReturnValue({ run } as unknown as ReturnType<
      typeof operateOrderFinanceWorkflow
    >);
  run.mockResolvedValue({ result: {} });
});

it("preserves manual behavior until explicitly configured", async () => {
  listStores.mockResolvedValue([{ id: "store_test", metadata: null }]);
  expect(parsePaymentCaptureSettings(null).mode).toBe("manual");
  expect(await capturePreparedPurchase(container, "order_1")).toBe("manual");
  expect(readOrderFinance).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
});

it("waits for every active order and all its quantities", async () => {
  const group = preparedPurchase();
  group.orders[1].items![0].detail.fulfilled_quantity = 1;
  mockPurchase(group);
  expect(await capturePreparedPurchase(container, "order_1")).toBe("skipped");
  expect(run).not.toHaveBeenCalled();
});

it("dispatches the existing finance workflow with server-calculated amount", async () => {
  mockPurchase();
  expect(await capturePreparedPurchase(container, "order_2")).toBe("captured");
  expect(run).toHaveBeenCalledWith({
    input: {
      order_id: "order_1",
      actor_id: "user_operator",
      automatic_capture_revision: revision,
      action: "capture",
      confirm: true,
      request_id: automaticCaptureRequestId("group_shared"),
      note: "Cobro automático: todos los pedidos activos están preparados.",
    },
  });
});

it("excludes a canceled unprepared order and handles its event", async () => {
  const group = preparedPurchase();
  group.orders[0].status = "canceled";
  group.orders[0].items = [];
  group.orders[0].fulfillments = [];
  mockPurchase(group);
  expect(await capturePreparedPurchase(container, "order_1")).toBe("captured");
  expect(run.mock.calls[0][0].input.order_id).toBe("order_2");
});

it("does not capture twice after a repeated preparation event", async () => {
  const group = mockPurchase();
  await capturePreparedPurchase(container, "order_1");
  group.orders[0].cart.payment_collection.payments[0].captures = [
    { id: "cap_paid", amount: 150 },
  ];
  await capturePreparedPurchase(container, "order_2");
  expect(run).toHaveBeenCalledTimes(1);
});

it("uses one idempotency request across preparation events from different shops", async () => {
  mockPurchase();
  await capturePreparedPurchase(container, "order_1");
  await capturePreparedPurchase(container, "order_2");
  expect(run.mock.calls[0][0].input).toEqual(run.mock.calls[1][0].input);
});

it("never repeats a purchase with an uncertain operation or active finance writer", async () => {
  mockPurchase(preparedPurchase(), true);
  expect(await capturePreparedPurchase(container, "order_1")).toBe("skipped");
  expect(run).not.toHaveBeenCalled();
});

it("stops an in-flight automatic plan after the operator selects manual", async () => {
  listStores.mockResolvedValue([
    {
      ...store,
      metadata: {
        usapeek_payment_capture: {
          ...store.metadata.usapeek_payment_capture,
          mode: "manual",
        },
      },
    },
  ]);
  await expect(
    assertAutomaticCaptureSettings(container, revision, "user_operator"),
  ).rejects.toThrow("modo de cobro cambió");
});

it("rejects an outdated automatic plan after mode or operator changes", async () => {
  await expect(
    assertAutomaticCaptureSettings(container, "obsolete", "user_operator"),
  ).rejects.toThrow();
  await expect(
    assertAutomaticCaptureSettings(container, revision, "user_other"),
  ).rejects.toThrow();
});

it("fails closed for malformed persisted settings", () => {
  expect(() =>
    parsePaymentCaptureSettings({
      usapeek_payment_capture: { mode: "automatic" },
    }),
  ).toThrow();
});
