"use client"

import { ShoppingBag } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { CART_UPDATED_EVENT, cartCountFromEvent } from "../cart-events"

export function CartIndicator({ initialCount }: { initialCount: number | null }) {
  const [count, setCount] = useState(initialCount)

  useEffect(() => {
    const update = (event: Event) => {
      const confirmedCount = cartCountFromEvent(event)
      if (confirmedCount !== null) setCount(confirmedCount)
    }
    window.addEventListener(CART_UPDATED_EVENT, update)
    return () => window.removeEventListener(CART_UPDATED_EVENT, update)
  }, [])

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
