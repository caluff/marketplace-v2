export const CART_UPDATED_EVENT = "marketplace:cart-updated"

export function notifyCartUpdated(count: number) {
  window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: count }))
}

export function cartCountFromEvent(event: Event): number | null {
  if (!(event instanceof CustomEvent)) return null
  const count: unknown = event.detail
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
    ? count
    : null
}
