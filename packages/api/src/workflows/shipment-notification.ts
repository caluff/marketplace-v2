import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { z } from "@medusajs/framework/zod";
import { getAuthEmailConfiguration } from "../lib/auth-email";
import { deliverEmailNotification } from "../lib/deliver-email-notification";

export type ShipmentNotificationInput = { id: string; no_notification?: boolean };

const sendShipmentNotificationStep = createStep(
  "send-shipment-notification",
  async (input: ShipmentNotificationInput, { container }) => {
    if (input.no_notification) return new StepResponse({ sent: false });
    const configuration = getAuthEmailConfiguration();
    if (!configuration.enabled) return new StepResponse({ sent: false });
    const id = z.string().regex(/^ful_[a-zA-Z0-9]+$/).parse(input.id);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const { data: [fulfillment] } = await query.graph({
      entity: "fulfillment",
      fields: [
        "id", "shipped_at", "canceled_at", "requires_shipping",
        "labels.tracking_number",
        "order.id", "order.email", "order.display_id", "order.status",
      ],
      filters: { id },
    });
    const order = fulfillment?.order;
    if (!fulfillment?.shipped_at || fulfillment.canceled_at || !fulfillment.requires_shipping
      || !order?.email || order.status === "canceled") {
      return new StepResponse({ sent: false });
    }
    let orderUrl: URL;
    try {
      const base = new URL(process.env.STOREFRONT_URL ?? "");
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password
        || base.search || base.hash) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid storefront URL");
      }
      orderUrl = new URL(`/account/orders/${encodeURIComponent(order.id)}`, base);
    } catch {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "[shipment-email] STOREFRONT_URL must be a valid public URL");
    }
    const notification = await deliverEmailNotification(container, {
      to: order.email,
      from: configuration.from,
      channel: "email",
      template: "order-shipped",
      trigger_type: "shipment.created",
      // Each package has its own event; retries must not send a second email.
      idempotency_key: `shipment-created:${fulfillment.id}`,
      data: {
        order_number: String(order.display_id),
        order_url: orderUrl.toString(),
        tracking_numbers: fulfillment.labels?.map((label) => label.tracking_number).filter(Boolean) ?? [],
      },
    });
    if (notification.status !== "success") {
      throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "Shipment notification delivery was not confirmed");
    }
    return new StepResponse({ sent: true });
  },
);

export const sendShipmentNotificationWorkflow = createWorkflow(
  "send-shipment-notification",
  function (input: ShipmentNotificationInput) {
    return new WorkflowResponse(sendShipmentNotificationStep(input));
  },
);
