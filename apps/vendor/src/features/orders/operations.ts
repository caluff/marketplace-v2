import type {
  HttpTypes,
  OrderDetailDTO,
  OrderLineItemDTO,
} from "@medusajs/types";
import { scopedClient, type AuthorizeVendor } from "../workspace/operations";
import { resourceId, stockQuantity, textField } from "../workspace/validation";
import { sellerWarehouse } from "../inventory/data";

function orderQuantity(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : null;
}

export function remainingToPrepare(item: OrderLineItemDTO) {
  const quantity = orderQuantity(item.quantity ?? item.detail?.quantity);
  const fulfilled = orderQuantity(item.detail?.fulfilled_quantity);
  if (quantity === null || fulfilled === null || fulfilled > quantity)
    return null;
  return quantity - fulfilled;
}

export function preparationIssue(order: OrderDetailDTO) {
  if (order.status !== "pending")
    return "El estado actual del pedido no permite preparar artículos.";
  if (!order.items?.length)
    return "No se cargaron los artículos del pedido. Actualiza la página para volver a intentarlo.";
  if (
    order.items.some(
      (item) =>
        !item?.id ||
        remainingToPrepare(item) === null ||
        typeof item.requires_shipping !== "boolean",
    )
  )
    return "No se pudieron verificar las cantidades o el tipo de envío. Actualiza la página; si el problema continúa, contacta al operador.";
  if (!order.items.some((item) => (remainingToPrepare(item) ?? 0) > 0))
    return "No quedan artículos pendientes de preparar.";
  return null;
}

export function orderCapabilities(order: OrderDetailDTO) {
  const active = order.status === "pending";
  const fulfillments = (order.fulfillments ?? []).filter(
    (entry) => !entry.canceled_at,
  );
  return {
    prepare: preparationIssue(order) === null,
    cancel:
      active &&
      !fulfillments.some((entry) => entry.shipped_at || entry.delivered_at),
    complete:
      active &&
      Boolean(order.items?.length) &&
      (order.items ?? []).every(
        (item) =>
          Boolean(item) &&
          remainingToPrepare(item) !== null &&
          typeof item.requires_shipping === "boolean" &&
          Number(
            item.requires_shipping
              ? Math.max(
                  Number(item.detail?.shipped_quantity ?? 0),
                  Number(item.detail?.delivered_quantity ?? 0),
                )
              : item.detail?.fulfilled_quantity,
          ) >= Number(item.quantity),
      ),
  };
}

function trackingUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error();
    return url.href;
  } catch {
    throw new Error(
      "La dirección de seguimiento debe ser una URL http o https válida.",
    );
  }
}

export function orderOperations(authorize: AuthorizeVendor) {
  return {
    async execute(form: FormData) {
      const client = scopedClient(await authorize());
      const id = resourceId(textField(form, "order_id", true));
      const action = textField(form, "action", true);
      if (
        ![
          "prepare",
          "ship",
          "deliver",
          "cancel_fulfillment",
          "complete",
        ].includes(action)
      )
        throw new Error("La operación de pedido no es válida.");
      if (
        ["cancel_fulfillment", "complete", "deliver"].includes(action) &&
        textField(form, "confirmation") !== "yes"
      )
        throw new Error("Confirma la operación antes de continuar.");
      const { order } = await client.get<{ order: OrderDetailDTO }>(
        `/vendor/orders/${id}`,
        {
          fields:
            "id,status,items.id,items.quantity,items.requires_shipping,items.detail.quantity,items.detail.fulfilled_quantity,items.detail.shipped_quantity,items.detail.delivered_quantity,fulfillments.id,fulfillments.canceled_at,fulfillments.shipped_at,fulfillments.delivered_at,fulfillments.items.*",
        },
      );
      const capabilities = orderCapabilities(order);
      if (action === "complete") {
        if (!capabilities[action])
          throw new Error(
            "El estado actual del pedido no permite esta operación. Actualiza la página.",
          );
        await client.post(`/vendor/orders/${id}/${action}`, {});
        return;
      }
      if (order.status !== "pending")
        throw new Error(
          "Este pedido ya no admite cambios de preparación o envío.",
        );
      if (action === "prepare") {
        if (!capabilities.prepare) throw new Error(preparationIssue(order)!);
        const items: HttpTypes.AdminCreateOrderFulfillment["items"] = [];
        for (const [key] of form) {
          if (!key.startsWith("quantity:")) continue;
          const itemId = resourceId(key.slice("quantity:".length));
          const item = order.items?.find((entry) => entry.id === itemId);
          if (!item) throw new Error("El artículo no pertenece a este pedido.");
          const quantity = stockQuantity(textField(form, key, true));
          const remaining = remainingToPrepare(item);
          if (remaining === null || quantity > remaining)
            throw new Error(
              "La cantidad supera los artículos pendientes de preparar.",
            );
          if (quantity > 0) items.push({ id: item.id, quantity });
        }
        if (!items.length)
          throw new Error("Selecciona al menos un artículo para preparar.");
        if (new Set(items.map((item) => item.id)).size !== items.length)
          throw new Error("Los artículos no pueden repetirse.");
        const shippingRequirements = new Set(
          items.map(
            (selected) =>
              order.items?.find((item) => item.id === selected.id)
                ?.requires_shipping,
          ),
        );
        if (shippingRequirements.size > 1)
          throw new Error(
            "Prepara los artículos con envío y sin envío por separado.",
          );
        const warehouse = await sellerWarehouse(client);
        if (warehouse.status !== "ready")
          throw new Error(
            "No se pudo verificar el almacén aprobado. Revisa tu almacén o contacta al operador.",
          );
        const body = {
          items,
          location_id: resourceId(warehouse.location.id),
          requires_shipping: items.some(
            (selected) =>
              order.items?.find((item) => item.id === selected.id)
                ?.requires_shipping,
          ),
        } satisfies HttpTypes.AdminCreateOrderFulfillment &
          Pick<OrderLineItemDTO, "requires_shipping">;
        await client.post(`/vendor/orders/${id}/fulfillments`, body);
        return;
      }
      const fulfillmentId = resourceId(textField(form, "fulfillment_id", true));
      const fulfillment = order.fulfillments?.find(
        (entry) => entry.id === fulfillmentId,
      );
      if (!fulfillment || fulfillment.canceled_at)
        throw new Error("La preparación no está disponible para este pedido.");
      const path = `/vendor/orders/${id}/fulfillments/${fulfillmentId}`;
      if (action === "cancel_fulfillment") {
        if (fulfillment.shipped_at || fulfillment.delivered_at)
          throw new Error("No se puede cancelar una preparación ya enviada.");
        await client.post(`${path}/cancel`, {});
      } else if (action === "deliver") {
        if (!fulfillment.shipped_at || fulfillment.delivered_at)
          throw new Error(
            "Solo se pueden entregar envíos pendientes de entrega.",
          );
        await client.post(`${path}/mark-as-delivered`, {});
      } else {
        if (fulfillment.shipped_at || fulfillment.delivered_at)
          throw new Error("Esta preparación ya fue enviada.");
        if (!fulfillment.items?.length)
          throw new Error("La preparación no contiene artículos.");
        const trackingNumber = textField(form, "tracking_number", false, 200);
        const url = trackingUrl(textField(form, "tracking_url", false, 2000));
        if (url && !trackingNumber)
          throw new Error(
            "Indica el número de seguimiento para añadir su enlace.",
          );
        // The native workflow derives order quantities from the fulfillment,
        // including inventory kits; fulfillment item quantities are stock units.
        const body = {
          items: [],
          labels: trackingNumber
            ? [
                {
                  tracking_number: trackingNumber,
                  tracking_url: url,
                  label_url: "",
                },
              ]
            : [],
        } satisfies HttpTypes.AdminCreateOrderShipment;
        await client.post(`${path}/shipments`, body);
      }
    },
  };
}
