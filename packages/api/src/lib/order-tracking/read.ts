import { getOrderDetailWorkflow } from "@medusajs/core-flows";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { assertTrackingRecipient, invalidOrderTrackingLink, verifyOrderTrackingToken } from "./access";
import { StoreOrderTrackingResponseSchema, type StoreOrderTrackingResponse } from "./contracts";

function safeTrackingUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function readOrderTracking(container: MedusaContainer, token: string): Promise<StoreOrderTrackingResponse> {
  const claims = verifyOrderTrackingToken(token);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: ["id", "email", "is_draft_order"],
    filters: { id: claims.order_id },
  }, { cache: { enable: false } });
  if (!order || order.is_draft_order) invalidOrderTrackingLink();
  assertTrackingRecipient(claims.recipient, order.email);

  const { result } = await getOrderDetailWorkflow(container).run({ input: {
    order_id: claims.order_id,
    filters: { is_draft_order: false },
    fields: [
      "email", "display_id", "custom_display_id", "created_at", "status", "currency_code", "total",
      // Native quantities and partial fulfillment status are computed from
      // versioned detail when the complete item is normalized by Medusa.
      "items.*", "items.detail.*",
      "items.variant.product.thumbnail", "items.variant.product.images.url",
      "fulfillments.id", "fulfillments.created_at", "fulfillments.packed_at",
      "fulfillments.shipped_at", "fulfillments.delivered_at", "fulfillments.canceled_at",
      "fulfillments.labels.tracking_number", "fulfillments.labels.tracking_url",
    ],
  } });
  assertTrackingRecipient(claims.recipient, result.email);
  // Strip native workflow extras (addresses, payments, fulfillment provider data)
  // before returning a deliberately narrow bearer-link projection.
  const response = StoreOrderTrackingResponseSchema.parse({ order: result });
  for (const fulfillment of response.order.fulfillments) {
    for (const label of fulfillment.labels) label.tracking_url = safeTrackingUrl(label.tracking_url);
  }
  return response;
}
