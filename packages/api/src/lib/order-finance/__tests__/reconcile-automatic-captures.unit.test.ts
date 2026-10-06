import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../../../modules/commerce-automation";
import { capturePreparedPurchase } from "../automatic-capture";
import { reconcileAutomaticCaptures } from "../../../workflows/reconcile-automatic-captures";

jest.mock("../automatic-capture", () => ({
  capturePreparedPurchase: jest.fn(),
}));

const revision = "755f0a82-7cf6-4195-b833-825c955918dc";
const listStores = jest.fn();
const graph = jest.fn();
const warn = jest.fn();
const journal = {
  listCommerceScans: jest.fn(),
  listCommerceGroupStates: jest.fn(),
  createCommerceScans: jest.fn(),
  updateCommerceScans: jest.fn(),
};
const container = {
  resolve: (name: string) => {
    if (name === Modules.STORE) return { listStores };
    if (name === ContainerRegistrationKeys.QUERY) return { graph };
    if (name === ContainerRegistrationKeys.LOGGER) return { warn };
    if (name === COMMERCE_AUTOMATION_MODULE) return journal;
    throw new Error(`Unexpected dependency: ${name}`);
  },
} as unknown as MedusaContainer;

function group(id: string) {
  return {
    id,
    orders: [{ id: `order_${id}`, status: "pending" }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  listStores.mockResolvedValue([
    {
      id: "store_test",
      metadata: {
        usapeek_payment_capture: {
          mode: "automatic",
          revision,
          actor_id: "user_operator",
        },
      },
    },
  ]);
  journal.listCommerceScans.mockResolvedValue([]);
  journal.listCommerceGroupStates.mockResolvedValue([]);
  graph.mockResolvedValue({ data: [group("group_ready")] });
  jest.mocked(capturePreparedPurchase).mockResolvedValue("captured");
});

it("discovers a ready purchase even when no finance journal state exists yet", async () => {
  await reconcileAutomaticCaptures(container);
  expect(graph).toHaveBeenCalledWith(
    {
      entity: "order_group",
      fields: ["id", "orders.id", "orders.status"],
      filters: {},
      pagination: { take: 25, order: { id: "ASC" } },
    },
    { cache: { enable: false } },
  );
  expect(capturePreparedPurchase).toHaveBeenCalledWith(
    container,
    "order_group_ready",
  );
});

it("does not scan purchases while manual mode is selected", async () => {
  listStores.mockResolvedValue([{ id: "store_test", metadata: null }]);
  await reconcileAutomaticCaptures(container);
  expect(graph).not.toHaveBeenCalled();
  expect(capturePreparedPurchase).not.toHaveBeenCalled();
});

it("skips purchases being edited, already captured, or awaiting financial review", async () => {
  graph.mockResolvedValue({
    data: [group("busy"), group("review"), group("paid"), group("ready")],
  });
  journal.listCommerceGroupStates.mockResolvedValue([
    { id: "busy", active_token: "in_progress" },
    { id: "review", review_required: true },
    { id: "paid", observation: { finance_final_capture: {} } },
  ]);
  await reconcileAutomaticCaptures(container);
  expect(capturePreparedPurchase).toHaveBeenCalledTimes(1);
  expect(capturePreparedPurchase).toHaveBeenCalledWith(
    container,
    "order_ready",
  );
});

it("continues to later purchases after an error and skips fully canceled purchases", async () => {
  graph.mockResolvedValue({
    data: [
      group("invalid"),
      {
        id: "canceled",
        orders: [{ id: "order_canceled", status: "canceled" }],
      },
      group("ready"),
    ],
  });
  jest
    .mocked(capturePreparedPurchase)
    .mockRejectedValueOnce(new Error("uncertain"));
  await reconcileAutomaticCaptures(container);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(capturePreparedPurchase).toHaveBeenCalledTimes(2);
  expect(capturePreparedPurchase).toHaveBeenLastCalledWith(
    container,
    "order_ready",
  );
});

it("resumes a bounded sweep and resets the cursor after the last page", async () => {
  journal.listCommerceScans.mockResolvedValue([
    { id: "automatic-payment-capture", position: "group_previous" },
  ]);
  const groups = Array.from({ length: 25 }, (_, index) =>
    group(`group_${index}`),
  );
  graph.mockResolvedValueOnce({ data: groups });
  await reconcileAutomaticCaptures(container);
  expect(graph.mock.calls[0][0].filters).toEqual({
    id: { $gt: "group_previous" },
  });
  expect(capturePreparedPurchase).toHaveBeenCalledTimes(25);
  expect(journal.updateCommerceScans).toHaveBeenCalledWith({
    id: "automatic-payment-capture",
    position: "group_24",
  });
  expect(journal.createCommerceScans).not.toHaveBeenCalled();
  graph.mockResolvedValueOnce({ data: [] });
  await reconcileAutomaticCaptures(container);
  expect(journal.updateCommerceScans).toHaveBeenLastCalledWith({
    id: "automatic-payment-capture",
    position: null,
  });
});
