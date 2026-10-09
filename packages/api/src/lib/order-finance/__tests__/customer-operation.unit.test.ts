import type { MedusaContainer } from "@medusajs/framework/types";
import { operateOrderFinance } from "../../../workflows/steps/operate-order-finance";
import { readOrderFinance } from "../read";
import { withFinanceExecutionLock } from "../execution-lock";
import { readFinanceProvider } from "../provider";
import { financeView, initialAllocation } from "../policy";
import { financeGroup } from "./fixtures";

jest.mock("../read", () => ({ readOrderFinance: jest.fn() }));
jest.mock("../execution-lock", () => ({ withFinanceExecutionLock: jest.fn() }));
jest.mock("../provider", () => ({
  readFinanceProvider: jest.fn(),
  assertProviderBalances: jest.fn(),
}));
jest.mock("../../../workflows/order-finance-native", () => ({}));
jest.mock("../record-provider-facts", () => ({
  recordOrderFinanceProviderFacts: jest.fn(),
}));

const container = {} as MedusaContainer;
const input = {
  actor_id: "cus_owner",
  customer_id: "cus_owner",
  order_id: "order_1",
  action: "cancel" as const,
  note: "Cambio de planes",
  confirm: true as const,
  request_id: "755f0a82-7cf6-4195-b833-825c955918dc",
};

beforeEach(() => jest.clearAllMocks());

it("rejects buyer capture and standalone refund before opening a financial operation", async () => {
  for (const action of ["capture", "refund"] as const) {
    await expect(
      operateOrderFinance(container, { ...input, action, amount: 1 }),
    ).rejects.toThrow("Solo puedes cancelar tu pedido");
  }
  expect(readOrderFinance).not.toHaveBeenCalled();
  expect(withFinanceExecutionLock).not.toHaveBeenCalled();
  expect(readFinanceProvider).not.toHaveBeenCalled();
});

it("rechecks preparation under the shared financial lock and stops before moving money", async () => {
  const group = financeGroup();
  group.orders[0].customer_id = input.customer_id;
  group.orders[0].fulfillments = [{ id: "ful_started", canceled_at: null }];
  const releaseGroup = jest.fn();
  const current = {
    group,
    operations: [],
    view: financeView({
      group,
      orderId: input.order_id,
      allocation: initialAllocation(group),
      history: [],
      knownRefundIds: [],
      hasPayout: false,
      isHeld: false,
      isOperator: false,
      customerId: input.customer_id,
    }),
    journal: {
      claimFinanceGroup: jest
        .fn()
        .mockResolvedValue({ id: group.id, active_token: "owned_token" }),
      releaseGroup,
    },
  } as unknown as Awaited<ReturnType<typeof readOrderFinance>>;
  jest.mocked(readOrderFinance).mockResolvedValue(current);
  jest
    .mocked(withFinanceExecutionLock)
    .mockImplementation(async (_container, _scope, execute) =>
      execute("owner_lock"),
    );
  await expect(operateOrderFinance(container, input)).rejects.toThrow(
    "La tienda ya empezó a preparar",
  );
  expect(readOrderFinance).toHaveBeenCalledTimes(3);
  expect(readOrderFinance).toHaveBeenLastCalledWith(
    container,
    input.order_id,
    input,
    "owned_token",
  );
  expect(releaseGroup).toHaveBeenCalledWith(group.id, "owned_token");
  expect(readFinanceProvider).not.toHaveBeenCalled();
});
