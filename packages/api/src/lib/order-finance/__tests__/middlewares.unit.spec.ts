import { EventEmitter } from "node:events";
import { asValue } from "@medusajs/framework/awilix";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { guardOrderFinanceWriters } from "../../../api/order-finance-middlewares";
import { COMMERCE_AUTOMATION_MODULE } from "../../../modules/commerce-automation";

const mockWriterFence = jest.fn(
  async ({ input }: { input: { action: string } }) => ({
    result: input.action === "claim" ? "writer_token" : "writer_token",
  }),
);
jest.mock("../../../workflows/guard-order-finance-writer", () => ({
  guardOrderFinanceWriterWorkflow: () => ({ run: mockWriterFence }),
}));
beforeEach(() => mockWriterFence.mockClear());

function fixture(route: string) {
  const scope = createMedusaContainer();
  const response = new EventEmitter();
  const state = {
    active_token: null as string | null,
    review_required: false,
    observation: {} as Record<string, unknown>,
  };
  const orders = [{ status: "pending" }, { status: "pending" }];
  const graph = jest.fn(async ({ entity }: { entity: string }) => {
    if (entity === "order_cart") return { data: [{ cart_id: "cart_shared" }] };
    if (entity === "payment")
      return {
        data: [{ payment_collection: { cart: { id: "cart_shared" } } }],
      };
    if (entity === "payment_collection")
      return { data: [{ cart: { id: "cart_shared" } }] };
    if (["return", "order_claim", "order_exchange"].includes(entity))
      return { data: [{ order_id: "order_1" }] };
    if (entity === "order_group")
      return { data: [{ id: "group_shared", orders }] };
    throw new Error(`Unexpected graph entity ${entity}`);
  });
  const execute = jest.fn(async (_key: string, callback: () => Promise<void>) =>
    callback(),
  );
  scope.register({
    query: asValue({ graph }),
    locking: asValue({ execute }),
    [COMMERCE_AUTOMATION_MODULE]: asValue({
      listCommerceGroupStates: jest.fn(async () => [state]),
    }),
  });
  const req = {
    originalUrl: route,
    scope,
    body: { order_id: "order_1" },
  } as unknown as MedusaRequest;
  const res = response as unknown as MedusaResponse;
  const next = jest.fn();
  return {
    state,
    orders,
    graph,
    execute,
    next,
    response,
    run: () => guardOrderFinanceWriters(req, res, next),
  };
}

describe("order finance writer guards", () => {
  it.each([
    "/admin/payments/%70ay_shared/refund",
    "/ADMIN/Payments/pay_shared/REFUND",
  ])("canonicalizes routed payment IDs before guarding %s", async (route) => {
    const test = fixture(route);
    await test.run();
    expect(test.graph).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "payment",
        filters: { id: "pay_shared" },
      }),
      expect.any(Object),
    );
    expect(test.next).toHaveBeenCalledWith(
      expect.objectContaining({ type: "not_allowed" }),
    );
  });
  it.each(["/admin/orders/%6Frder_1/cancel", "/ADMIN/Orders/order_1/CANCEL"])(
    "blocks normalized cancellation %s",
    async (route) => {
      const test = fixture(route);
      await test.run();
      expect(test.graph).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: "order_cart",
          filters: { order_id: "order_1" },
        }),
        expect.any(Object),
      );
      expect(test.next).toHaveBeenCalledWith(
        expect.objectContaining({ type: "not_allowed" }),
      );
    },
  );
  it.each(["/admin/payments/%XX/refund", "/admin/payments/pay%2Fother/refund"])(
    "rejects malformed or encoded separator paths %s",
    async (route) => {
      const test = fixture(route);
      await test.run();
      expect(test.graph).not.toHaveBeenCalled();
      expect(test.next).toHaveBeenCalledWith(
        expect.objectContaining({ type: "invalid_data" }),
      );
    },
  );
  it.each([
    "/admin/returns",
    "/admin/returns/return_1/receive/confirm",
    "/admin/claims/claim_1/confirm",
    "/admin/exchanges/exc_1/confirm",
  ])(
    "rejects concurrent order change writer %s while money is in flight",
    async (route) => {
      const test = fixture(route);
      test.state.active_token = "financial_owner";
      await test.run();
      expect(test.next).toHaveBeenCalledWith(
        expect.objectContaining({ type: "not_allowed" }),
      );
    },
  );
  it("blocks new shared collection payments and native recapture even without a journal", async () => {
    for (const route of [
      "/admin/payment-collections/paycol_shared/payments",
      "/admin/payments/pay_shared/capture",
    ]) {
      const test = fixture(route);
      await test.run();
      expect(test.next).toHaveBeenCalledWith(
        expect.objectContaining({ type: "not_allowed" }),
      );
    }
  });
  it.each([
    "/admin/orders/order_1/cancel",
    "/vendor/orders/order_1/cancel/?fields=id",
    "/admin/payments/pay_shared/refund",
    "/vendor/payments/pay_shared/refund",
  ])("blocks bypass via %s", async (route) => {
    const test = fixture(route);
    await test.run();
    expect(test.next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Cancelaciones y reembolsos"),
      }),
    );
    expect(test.execute).not.toHaveBeenCalled();
  });

  it("lets the dedicated finance endpoint use its own claim and locking flow", async () => {
    const test = fixture("/vendor/orders/order_1/finance");
    await test.run();
    expect(test.next).toHaveBeenCalledWith();
    expect(test.graph).not.toHaveBeenCalled();
  });

  it.each(["active", "review", "allocated", "canceled seller"])(
    "blocks capture when the shared purchase has %s state",
    async (mode) => {
      const test = fixture("/admin/payments/pay_shared/capture");
      if (mode === "active") test.state.active_token = "other_token";
      if (mode === "review") test.state.review_required = true;
      if (mode === "allocated")
        test.state.observation.finance_allocation = { orders: [] };
      if (mode === "canceled seller") test.orders[1].status = "canceled";
      await test.run();
      expect(test.next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("conciliación"),
        }),
      );
    },
  );

  it.each(["finish", "close"])(
    "holds the shared-cart lock until the response emits %s",
    async (event) => {
      const test = fixture("/vendor/orders/order_1/fulfillments");
      let settled = false;
      const running = test.run().then(() => {
        settled = true;
      });
      // Drain the finite chain of graph/journal reads before checking the response fence.
      for (let turn = 0; turn < 10; turn++) await Promise.resolve();
      expect(test.next).toHaveBeenCalledWith();
      expect(settled).toBe(false);
      expect(test.execute).toHaveBeenCalledWith(
        "cart_shared",
        expect.any(Function),
        { timeout: 5 },
      );
      test.response.emit(event);
      await running;
      expect(settled).toBe(true);
      expect(test.response.listenerCount("finish")).toBe(0);
      expect(test.response.listenerCount("close")).toBe(0);
      expect(mockWriterFence).toHaveBeenLastCalledWith({
        input: {
          group_id: "group_shared",
          cart_id: "cart_shared",
          token: "writer_token",
          action: event === "finish" ? "finish" : "disconnect",
        },
      });
      // A late native completion must never clear the durable disconnect hold.
      test.response.emit("finish");
      expect(mockWriterFence).toHaveBeenCalledTimes(2);
    },
  );
});
