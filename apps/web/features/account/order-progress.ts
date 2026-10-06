import type { HttpTypes } from "@medusajs/types"

type CompletionQuantity =
  | "fulfilled_quantity"
  | "shipped_quantity"
  | "delivered_quantity"

type ProgressItem = Pick<HttpTypes.StoreOrderLineItem, "quantity"> & {
  detail?: {
    [Key in CompletionQuantity]?: HttpTypes.StoreOrderLineItem["detail"][Key] | null
  } | null
}

export function getOrderProgress(
  order: Pick<
    HttpTypes.StoreOrder,
    "status" | "fulfillment_status" | "created_at"
  > & { items?: readonly ProgressItem[] | null },
) {
  const status = order.fulfillment_status
  const canceled = order.status === "canceled"
  const items = order.items?.filter((item) => item.quantity > 0) ?? []
  const hasCompletedQuantity = (field: CompletionQuantity) =>
    items.length > 0 &&
    items.every((item) => {
      const quantity = item.detail?.[field]
      return typeof quantity === "number" && quantity >= item.quantity
    })
  const prepared =
    ["fulfilled", "shipped", "delivered"].includes(status) ||
    hasCompletedQuantity("fulfilled_quantity")
  const shipped =
    ["shipped", "delivered"].includes(status) ||
    hasCompletedQuantity("shipped_quantity")
  const delivered =
    status === "delivered" || hasCompletedQuantity("delivered_quantity")
  return [
    { label: "Pedido recibido", complete: true },
    { label: "Preparado", complete: !canceled && prepared },
    { label: "Enviado", complete: !canceled && shipped },
    { label: "Entregado", complete: !canceled && delivered },
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
