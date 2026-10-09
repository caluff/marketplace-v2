import { GET, POST } from "../../../api/store/orders/[id]/cancellation/route";
import { readOrderFinance } from "../read";
import { operateOrderFinanceWorkflow } from "../../../workflows/operate-order-finance";
import { storeOrderCancellationInputSchema } from "../contracts";

jest.mock("../read", () => ({ readOrderFinance: jest.fn() }));
jest.mock("../../../workflows/operate-order-finance", () => ({
  operateOrderFinanceWorkflow: jest.fn(),
}));

const requestId = "755f0a82-7cf6-4195-b833-825c955918dc";
const scope = {};
const req = {
  scope,
  params: { id: "order_1" },
  auth_context: { actor_id: "cus_owner" },
  validatedBody: {
    note: "Cambio de planes",
    request_id: requestId,
    confirm: true,
  },
};
const json = jest.fn();
const setHeader = jest.fn();
const res = { json, setHeader };
const run = jest.fn();

beforeEach(() => jest.clearAllMocks());

it("returns only customer cancellation eligibility without internal financial data", async () => {
  jest
    .mocked(readOrderFinance)
    .mockResolvedValue({
      view: {
        finance: {
          cancellation: { allowed: true, reason: null, refund_amount: 70 },
          history: [{ note: "Internal operator note" }],
        },
      },
    } as Awaited<ReturnType<typeof readOrderFinance>>);
  await GET(
    req as unknown as Parameters<typeof GET>[0],
    res as unknown as Parameters<typeof GET>[1],
  );
  expect(json).toHaveBeenCalledWith({
    cancellation: { allowed: true, reason: null },
  });
  expect(readOrderFinance).toHaveBeenCalledWith(scope, "order_1", {
    actor_id: "cus_owner",
    customer_id: "cus_owner",
  });
  expect(setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
});

it("dispatches only cancellation with the authenticated buyer identity", async () => {
  jest
    .mocked(operateOrderFinanceWorkflow)
    .mockReturnValue({ run } as unknown as ReturnType<
      typeof operateOrderFinanceWorkflow
    >);
  run.mockResolvedValue({
    result: {
      finance: {
        cancellation: {
          allowed: false,
          reason: "El pedido ya está cancelado.",
        },
        history: [{ id: `cancel:order_1:${requestId}`, status: "complete" }],
      },
    },
  });
  await POST(
    req as unknown as Parameters<typeof POST>[0],
    res as unknown as Parameters<typeof POST>[1],
  );
  expect(run).toHaveBeenCalledWith({
    input: {
      ...req.validatedBody,
      action: "cancel",
      order_id: "order_1",
      actor_id: "cus_owner",
      customer_id: "cus_owner",
    },
  });
  expect(json).toHaveBeenCalledWith({
    cancellation: { allowed: false, reason: "El pedido ya está cancelado." },
    canceled: true,
  });
});

it("does not report canceled for an unresolved financial operation", async () => {
  jest
    .mocked(operateOrderFinanceWorkflow)
    .mockReturnValue({ run } as unknown as ReturnType<
      typeof operateOrderFinanceWorkflow
    >);
  run.mockResolvedValue({
    result: {
      finance: {
        cancellation: { allowed: false, reason: "Por verificar" },
        history: [{ id: `cancel:order_1:${requestId}`, status: "uncertain" }],
      },
    },
  });
  await expect(
    POST(
      req as unknown as Parameters<typeof POST>[0],
      res as unknown as Parameters<typeof POST>[1],
    ),
  ).rejects.toThrow("No pudimos confirmar la cancelación");
  expect(json).not.toHaveBeenCalled();
});

it("rejects action, amount and ownership fields in the public cancel-only body", () => {
  for (const extra of [
    { action: "refund" },
    { amount: 70 },
    { customer_id: "cus_other" },
    { seller_id: "seller_other" },
  ]) {
    expect(
      storeOrderCancellationInputSchema.safeParse({
        ...req.validatedBody,
        ...extra,
      }).success,
    ).toBe(false);
  }
});
