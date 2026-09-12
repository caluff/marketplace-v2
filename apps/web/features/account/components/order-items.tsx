import type { HttpTypes } from "@medusajs/types"
import { Package } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { formatOrderAmount } from "../order-format"

export function OrderItems({
  items,
  currencyCode,
  compact = false,
}: {
  items: HttpTypes.StoreOrderLineItem[]
  currencyCode: string
  compact?: boolean
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const thumbnail =
          item.thumbnail ||
          item.variant?.product?.thumbnail ||
          item.variant?.product?.images?.[0]?.url
        return (
          <li
            key={item.id}
            className={
              compact
                ? "flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                : "grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-2 py-5 first:pt-0 last:pb-0 sm:grid-cols-[6rem_minmax(0,1fr)_auto]"
            }
          >
            <div
              className={`relative shrink-0 overflow-hidden rounded-lg bg-muted ${compact ? "size-16" : "row-span-2 size-20 sm:size-24"}`}
            >
              {thumbnail ? (
                <Image
                  src={thumbnail}
                  alt={item.title}
                  fill
                  sizes={compact ? "64px" : "96px"}
                  className="object-contain"
                />
              ) : (
                <Package
                  className="absolute inset-0 m-auto size-6 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-5">
                {item.product_handle ? (
                  <Link
                    href={`/products/${encodeURIComponent(item.product_handle)}`}
                    className="hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  item.title
                )}
              </p>
              {item.variant_title &&
              !["Default Variant", "__default__"].includes(
                item.variant_title,
              ) ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.variant_title}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Cantidad: {item.quantity}
              </p>
            </div>
            {!compact ? (
              <p className="col-start-2 text-sm font-semibold tabular-nums sm:col-start-3 sm:row-start-1 sm:text-right">
                {formatOrderAmount(item.total, currencyCode)}
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
