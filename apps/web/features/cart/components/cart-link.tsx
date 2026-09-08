import Link from "next/link"
import { ShoppingBag } from "lucide-react"
import { getCart } from "../data"

export async function CartLink() {
  let count: number | null = null
  try {
    const cart = await getCart()
    count = cart?.items?.reduce((total, item) => total + item.quantity, 0) ?? 0
  } catch {
    /* Navigation stays available when the cart service is unavailable. */
  }
  return (
    <Link
      href="/cart"
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1 px-2 font-sans text-xs font-bold"
      aria-label={
        count === null ? "Ver carrito" : `Ver carrito, ${count} productos`
      }
    >
      <ShoppingBag className="size-5" aria-hidden="true" />
      <span aria-live="polite" aria-atomic="true">
        {count === null ? "—" : count}
      </span>
    </Link>
  )
}
