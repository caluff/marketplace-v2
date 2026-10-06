import type { MedusaContainer, NotificationDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, OrderWorkflowEvents } from "@medusajs/framework/utils";
import { buildOrderTrackingUrl } from "../../lib/order-tracking/access";
import { sendOrderConfirmationNotification } from "../order-confirmation-notification";
import { sendShipmentNotification } from "../shipment-notification";
import { config as confirmationSubscriber } from "../../subscribers/order-confirmed";

jest.mock("../../lib/order-tracking/access", () => ({
  buildOrderTrackingUrl: jest.fn(() => "http://localhost:3000/orders/track#token=private-test-token"),
}));

const graph = jest.fn();
const listNotifications = jest.fn();
const createNotifications = jest.fn();
const execute = jest.fn();
const container = {
  resolve(name: string) {
    if (name === ContainerRegistrationKeys.QUERY) return { graph };
    if (name === Modules.NOTIFICATION) return { listNotifications, createNotifications };
    if (name === Modules.LOCKING) return { execute };
    throw new Error(`Unexpected dependency: ${name}`);
  },
} as unknown as MedusaContainer;
const order = {
  id: "order_test123",
  email: "buyer@example.com",
  display_id: 18,
  custom_display_id: null,
  status: "pending",
  created_at: "2026-10-06T12:00:00.000Z",
};
const originalEnvironment = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AUTH_EMAIL_ENABLED = "true";
  process.env.RESEND_FROM_EMAIL = "usapeek <orders@example.com>";
  graph.mockResolvedValue({ data: [{ ...order }] });
  listNotifications.mockResolvedValue([]);
  createNotifications.mockResolvedValue({ id: "noti_test", status: "success" });
  execute.mockImplementation(async (_key: string, run: () => Promise<NotificationDTO>) => run());
});

afterAll(() => {
  process.env = originalEnvironment;
});

it("uses the native placement event emitted for normal and Mercur split orders", () => {
  expect(confirmationSubscriber.event).toBe(OrderWorkflowEvents.PLACED);
});

it("sends the guest confirmation to the order recipient with a stable private link", async () => {
  await expect(sendOrderConfirmationNotification(container, { id: order.id })).resolves.toEqual({ sent: true });
  expect(buildOrderTrackingUrl).toHaveBeenCalledWith({ id: order.id, email: order.email }, process.env, order.created_at);
  expect(createNotifications).toHaveBeenCalledWith(expect.objectContaining({
    to: order.email,
    template: "order-confirmed",
    trigger_type: OrderWorkflowEvents.PLACED,
    idempotency_key: `order-confirmed:${order.id}`,
    data: {
      order_number: "PED-000000018",
      order_url: "http://localhost:3000/orders/track#token=private-test-token",
    },
  }));
});

it("preserves the custom order reference", async () => {
  graph.mockResolvedValue({ data: [{ ...order, custom_display_id: "  CLIENT-18  " }] });
  await sendOrderConfirmationNotification(container, { id: order.id });
  expect(createNotifications).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ order_number: "CLIENT-18" }),
  }));
});

it("replays an accepted confirmation without requesting another delivery", async () => {
  await sendOrderConfirmationNotification(container, { id: order.id });
  listNotifications.mockResolvedValue([{ id: "noti_test", status: "success" }]);
  await sendOrderConfirmationNotification(container, { id: order.id });
  expect(createNotifications).toHaveBeenCalledTimes(1);
  expect(listNotifications).toHaveBeenLastCalledWith({ idempotency_key: `order-confirmed:${order.id}` });
});

it("retains the failed notification ID and deterministic URL on retry", async () => {
  listNotifications.mockResolvedValue([{ id: "noti_retry", status: "failure" }]);
  await sendOrderConfirmationNotification(container, { id: order.id });
  expect(createNotifications).toHaveBeenCalledWith(expect.objectContaining({
    id: "noti_retry",
    idempotency_key: `order-confirmed:${order.id}`,
  }));
  expect(buildOrderTrackingUrl).toHaveBeenCalledWith({ id: order.id, email: order.email }, process.env, order.created_at);
});

it("propagates delivery failures for the existing event bus retry policy", async () => {
  createNotifications.mockRejectedValue(new Error("Provider unavailable"));
  await expect(sendOrderConfirmationNotification(container, { id: order.id })).rejects.toThrow("Provider unavailable");
});

it("does not acknowledge a non-successful provider result", async () => {
  createNotifications.mockResolvedValue({ id: "noti_failed", status: "failure" });
  await expect(sendOrderConfirmationNotification(container, { id: order.id })).rejects.toThrow("Email delivery did not succeed");
});

it("keeps an ambiguous pending delivery for inspection without resending", async () => {
  listNotifications.mockResolvedValue([{ id: "noti_pending", status: "pending" }]);
  await expect(sendOrderConfirmationNotification(container, { id: order.id })).rejects.toThrow("inspect the pending notification");
  expect(createNotifications).not.toHaveBeenCalled();
});

it.each([
  { reason: "missing order", data: [] },
  { reason: "missing recipient", data: [{ ...order, email: null }] },
  { reason: "canceled order", data: [{ ...order, status: "canceled" }] },
  { reason: "draft order", data: [{ ...order, status: "draft" }] },
])("does not send a confirmation for $reason", async ({ data }) => {
  graph.mockResolvedValue({ data });
  await expect(sendOrderConfirmationNotification(container, { id: order.id })).resolves.toEqual({ sent: false });
  expect(createNotifications).not.toHaveBeenCalled();
});

it("does no work while outbound email is disabled", async () => {
  process.env.AUTH_EMAIL_ENABLED = "false";
  await expect(sendOrderConfirmationNotification(container, { id: order.id })).resolves.toEqual({ sent: false });
  expect(graph).not.toHaveBeenCalled();
  expect(createNotifications).not.toHaveBeenCalled();
});

it("honors explicit notification suppression before reading the order", async () => {
  await expect(sendOrderConfirmationNotification(container, { id: order.id, no_notification: true })).resolves.toEqual({ sent: false });
  expect(graph).not.toHaveBeenCalled();
});

it("rejects invalid event IDs before a database read", async () => {
  await expect(sendOrderConfirmationNotification(container, { id: "../orders" })).rejects.toThrow();
  expect(graph).not.toHaveBeenCalled();
});

it("uses the same guest-access mechanism for shipment emails with per-package identity", async () => {
  const shippedAt = "2026-10-07T12:00:00.000Z";
  graph.mockResolvedValue({ data: [{
    id: "ful_test123",
    shipped_at: shippedAt,
    canceled_at: null,
    requires_shipping: true,
    labels: [{ tracking_number: "TRACK123" }, { tracking_number: "" }],
    order,
  }] });
  await expect(sendShipmentNotification(container, { id: "ful_test123" })).resolves.toEqual({ sent: true });
  expect(buildOrderTrackingUrl).toHaveBeenCalledWith({ id: order.id, email: order.email }, process.env, shippedAt);
  expect(createNotifications).toHaveBeenCalledWith(expect.objectContaining({
    template: "order-shipped",
    idempotency_key: "shipment-created:ful_test123",
    data: {
      order_number: "PED-000000018",
      order_url: "http://localhost:3000/orders/track#token=private-test-token",
      tracking_numbers: ["TRACK123"],
    },
  }));
});

it.each([
  { shipped_at: null, canceled_at: null, requires_shipping: true, order },
  { shipped_at: order.created_at, canceled_at: order.created_at, requires_shipping: true, order },
  { shipped_at: order.created_at, canceled_at: null, requires_shipping: false, order },
  { shipped_at: order.created_at, canceled_at: null, requires_shipping: true, order: { ...order, status: "canceled" } },
])("preserves the shipment state guards", async (fulfillment) => {
  graph.mockResolvedValue({ data: [{ id: "ful_test123", ...fulfillment }] });
  await expect(sendShipmentNotification(container, { id: "ful_test123" })).resolves.toEqual({ sent: false });
  expect(createNotifications).not.toHaveBeenCalled();
});

it("honors shipment notification suppression", async () => {
  await expect(sendShipmentNotification(container, { id: "ful_test123", no_notification: true })).resolves.toEqual({ sent: false });
  expect(graph).not.toHaveBeenCalled();
});
