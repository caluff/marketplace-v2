import { asValue } from "@medusajs/framework/awilix";
import type { SubscriberArgs } from "@medusajs/framework";
import type { NotificationDTO } from "@medusajs/framework/types";
import { createMedusaContainer, FulfillmentWorkflowEvents } from "@medusajs/framework/utils";
import { getAuthEmailConfiguration } from "../../lib/auth-email";
import { deliverEmailNotification } from "../../lib/deliver-email-notification";
import { renderNotification } from "../../modules/resend/templates";
import orderShippedHandler, { config } from "../../subscribers/order-shipped";
import { sendShipmentNotificationWorkflow, type ShipmentNotificationInput } from "../shipment-notification";

jest.mock("../../lib/auth-email", () => ({ getAuthEmailConfiguration: jest.fn() }));
jest.mock("../../lib/deliver-email-notification", () => ({ deliverEmailNotification: jest.fn() }));

function fixture() {
  const fulfillment = {
    id: "ful_one", shipped_at: "2026-09-12T12:00:00Z", canceled_at: null as string | null,
    requires_shipping: true, items: [{ title: "Product", quantity: 2 }],
    labels: [{ tracking_number: "TRACK123" }],
    order: { id: "order_one", display_id: 42, email: "buyer@example.com", status: "pending" },
  };
  const graph = jest.fn(async () => ({ data: [fulfillment] }));
  const container = createMedusaContainer();
  container.register({
    query: asValue({ graph }),
    logger: asValue({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }),
    event_bus: asValue({ releaseGroupedEvents: jest.fn(async () => undefined), clearGroupedEvents: jest.fn(async () => undefined) }),
  });
  return { container, graph, fulfillment };
}

describe("native shipment notifications", () => {
  const previousUrl = process.env.STOREFRONT_URL;
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.STOREFRONT_URL = "https://shop.example.com";
    jest.mocked(getAuthEmailConfiguration).mockReturnValue({ enabled: true, from: "shop@example.com" });
    jest.mocked(deliverEmailNotification).mockResolvedValue({ status: "success" } as NotificationDTO);
  });
  afterAll(() => {
    if (previousUrl === undefined) delete process.env.STOREFRONT_URL;
    else process.env.STOREFRONT_URL = previousUrl;
  });

  it("subscribes to the native shipment event and reads the actual fulfillment owner", async () => {
    const state = fixture();
    expect(config.event).toBe(FulfillmentWorkflowEvents.SHIPMENT_CREATED);
    await orderShippedHandler({
      container: state.container, event: { data: { id: "ful_one" } },
    } as SubscriberArgs<ShipmentNotificationInput>);
    expect(state.graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "fulfillment", filters: { id: "ful_one" } }));
    expect(jest.mocked(deliverEmailNotification).mock.calls[0][1]).toEqual(expect.objectContaining({
      to: "buyer@example.com", template: "order-shipped", idempotency_key: "shipment-created:ful_one",
      data: { order_number: "42", order_url: "https://shop.example.com/account/orders/order_one", tracking_numbers: ["TRACK123"] },
    }));
  });

  it.each(["disabled", "suppressed"])("does no reads or delivery when %s", async (mode) => {
    const state = fixture();
    if (mode === "disabled") jest.mocked(getAuthEmailConfiguration).mockReturnValue({ enabled: false });
    await sendShipmentNotificationWorkflow(state.container).run({ input: { id: "ful_one", no_notification: mode === "suppressed" } });
    expect(state.graph).not.toHaveBeenCalled();
    expect(deliverEmailNotification).not.toHaveBeenCalled();
  });

  it.each(["missing", "unshipped", "canceled", "order-canceled", "nonshipping", "no-email"])("does not notify %s shipments", async (mode) => {
    const state = fixture();
    if (mode === "missing") state.graph.mockResolvedValue({ data: [] });
    if (mode === "unshipped") state.fulfillment.shipped_at = "";
    if (mode === "canceled") state.fulfillment.canceled_at = "2026-09-12T13:00:00Z";
    if (mode === "order-canceled") state.fulfillment.order.status = "canceled";
    if (mode === "nonshipping") state.fulfillment.requires_shipping = false;
    if (mode === "no-email") state.fulfillment.order.email = "";
    await sendShipmentNotificationWorkflow(state.container).run({ input: { id: "ful_one" } });
    expect(deliverEmailNotification).not.toHaveBeenCalled();
  });

  it("keeps retries idempotent while allowing multiple packages for one order", async () => {
    const state = fixture();
    for (const id of ["ful_one", "ful_one", "ful_two"]) {
      state.fulfillment.id = id;
      await sendShipmentNotificationWorkflow(state.container).run({ input: { id } });
    }
    expect(jest.mocked(deliverEmailNotification).mock.calls.map(([, input]) => input.idempotency_key))
      .toEqual(["shipment-created:ful_one", "shipment-created:ful_one", "shipment-created:ful_two"]);
  });

  it("propagates delivery failures so the event can retry", async () => {
    const state = fixture();
    jest.mocked(deliverEmailNotification).mockRejectedValue(new Error("Delivery failed"));
    await expect(sendShipmentNotificationWorkflow(state.container).run({ input: { id: "ful_one" } })).rejects.toMatchObject({ message: "Delivery failed" });
  });

  it("fails closed on an unsafe storefront URL", async () => {
    const state = fixture();
    process.env.STOREFRONT_URL = "javascript:alert(1)";
    await expect(sendShipmentNotificationWorkflow(state.container).run({ input: { id: "ful_one" } })).rejects.toMatchObject({ message: expect.stringContaining("STOREFRONT_URL") });
    expect(deliverEmailNotification).not.toHaveBeenCalled();
  });

  it("escapes seller-controlled content and never describes a partial shipment as the entire order", () => {
    const rendered = renderNotification("order-shipped", {
      order_number: "42", order_url: "https://shop.example.com/account/orders/order_one",
      tracking_numbers: ["<script>bad</script>", "<img src=x>"],
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("<img");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.text).toContain("Se envió un paquete de tu pedido");
  });
});
