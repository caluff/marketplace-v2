import type { MedusaContainer } from "@medusajs/framework/types";
import { hasPendingSellerOrders } from "../pending";
import { orderNotificationEventInput } from "../../../subscribers/order-notifications-changed";

jest.mock("../../../workflows/invalidate-order-notifications", () => ({}));

const graph = jest.fn();
const container = { resolve: () => ({ graph }) } as unknown as MedusaContainer;
beforeEach(() => jest.clearAllMocks());

it("marks a shipped or completed store order as requiring attention when it has an open return", async () => {
  graph.mockResolvedValueOnce({ data: [{ order_id: "order_store" }] });
  graph.mockResolvedValueOnce({ data: [{ id: "ret_pending" }] });
  expect(await hasPendingSellerOrders(container, "seller_owner")).toBe(true);
  expect(graph.mock.calls[0][0].filters.seller_id).toBe("seller_owner");
  expect(graph.mock.calls[1][0]).toMatchObject({
    entity: "return",
    filters: {
      order_id: ["order_store"],
      canceled_at: null,
      status: ["open", "requested", "partially_received"],
    },
    pagination: { take: 1 },
  });
});

it("does not read returns when the seller has no orders", async () => {
  graph.mockResolvedValueOnce({ data: [] });
  expect(await hasPendingSellerOrders(container, "seller_owner")).toBe(false);
  expect(graph).toHaveBeenCalledTimes(1);
});

it("resolves customer-return notifications by the native order link, without trusting a seller from the event", () => {
  expect(
    orderNotificationEventInput("order.customer_return_requested", {
      order_id: "order_owner",
    }),
  ).toEqual({ order_ids: ["order_owner"] });
  expect(() =>
    orderNotificationEventInput("order.customer_return_requested", {
      order_id: "seller_foreign",
    }),
  ).toThrow();
});
