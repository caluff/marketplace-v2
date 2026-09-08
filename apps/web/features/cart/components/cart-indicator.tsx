"use client"

import { ShoppingBag } from "lucide-react"
import Link from "next/link"
import { useEffect, useSyncExternalStore } from "react"
import {
  getCartCount,
  publishCartSnapshot,
  subscribeCartUpdates,
} from "../cart-events"

export function CartIndicator({
  initialCount,
  snapshotAt,
}: {
  initialCount: number | null
  snapshotAt: number
}) {
  const count = useSyncExternalStore(
    subscribeCartUpdates,
    () => getCartCount(initialCount, snapshotAt),
    () => initialCount,
  )

  useEffect(() => {
    if (initialCount !== null) publishCartSnapshot(initialCount, snapshotAt)
  }, [initialCount, snapshotAt])

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
