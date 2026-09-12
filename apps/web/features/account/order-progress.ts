import type { HttpTypes } from "@medusajs/types"

export function getOrderProgress(
  order: Pick<
    HttpTypes.StoreOrder,
    "status" | "fulfillment_status" | "created_at"
  > &
    Partial<Pick<HttpTypes.StoreOrder, "items">>,
) {
  const status = order.fulfillment_status
  const canceled = order.status === "canceled"
  const prepared =
    ["fulfilled", "shipped", "delivered"].includes(status) ||
    Boolean(
      order.items?.length &&
      order.items.every(
        (item) => item.detail?.fulfilled_quantity >= item.quantity,
      ),
    )
  const shipped =
    ["shipped", "delivered"].includes(status) ||
    Boolean(
      order.items?.length &&
      order.items.every(
        (item) => item.detail?.shipped_quantity >= item.quantity,
      ),
    )
  return [
    { label: "Pedido recibido", complete: true },
    { label: "Preparado", complete: !canceled && prepared },
    { label: "Enviado", complete: !canceled && shipped },
    { label: "Entregado", complete: !canceled && status === "delivered" },
  ]
}

export function safeTrackingUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}
