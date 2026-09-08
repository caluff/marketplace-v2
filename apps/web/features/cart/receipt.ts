export function getReceiptOrderIds(group: unknown, cartId: string): string[] {
  if (
    !group ||
    typeof group !== "object" ||
    !("cart_id" in group) ||
    group.cart_id !== cartId
  ) {
    throw new Error(
      "No pudimos verificar el comprobante de tu carrito. Consulta el estado nuevamente.",
    )
  }
  if (!("orders" in group) || !Array.isArray(group.orders)) {
    throw new Error(
      "No pudimos cargar el comprobante. Consulta el estado nuevamente.",
    )
  }
  const ids = group.orders.map((order: unknown) =>
    order && typeof order === "object" && "id" in order ? order.id : null,
  )
  if (
    !ids.length ||
    ids.length > 30 ||
    !ids.every(
      (id): id is string =>
        typeof id === "string" && /^order_[a-zA-Z0-9]+$/.test(id),
    )
  ) {
    throw new Error(
      "No pudimos recuperar los pedidos. Consulta el estado nuevamente.",
    )
  }
  return ids
}
