import { getCart } from "../data"
import { CartIndicator } from "./cart-indicator"

export async function CartLink() {
  let count: number | null = null
  try {
    const cart = await getCart()
    count = cart?.items?.reduce((total, item) => total + item.quantity, 0) ?? 0
  } catch {
    /* Navigation stays available when the cart service is unavailable. */
  }
  return <CartIndicator key={count ?? "unknown"} initialCount={count} />
}
