"use client"

import { Heart, MapPin, Package, Store, UserRound } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { ApplicationNavigation } from "@/features/vendor-onboarding/presentation"

const links = [
  { href: "/account", label: "Información de la cuenta", icon: UserRound },
  { href: "/account/orders", label: "Mis órdenes", icon: Package },
  { href: "/account/addresses", label: "Mis direcciones", icon: MapPin },
  { href: "/account/favorites", label: "Favoritos", icon: Heart },
]

export function AccountNav({
  vendorApplication,
}: {
  vendorApplication?: ApplicationNavigation
}) {
  const pathname = usePathname()
  return (
    <nav aria-label="Secciones de mi cuenta">
      <ul className="grid grid-cols-2 gap-1 lg:grid-cols-1">
        {[
          ...links,
          {
            href: "/account/sell",
            label: vendorApplication?.label ?? "Vender en Marketplace V2",
            icon: Store,
          },
        ].map(({ href, label, icon: Icon }) => {
          const active =
            href === "/account" ? pathname === href : pathname.startsWith(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 border-l-2 border-transparent px-3 py-3 text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40",
                  active
                    ? "border-brand-accent bg-brand-accent/10 font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Icon
                  className="size-5 shrink-0"
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                {label}
                {href === "/account/sell" &&
                Boolean(vendorApplication?.unreadCount) ? (
                  <span
                    className="ml-auto bg-brand-accent/10 px-2 py-1 text-xs"
                    aria-label={`${vendorApplication?.unreadCount} novedades sin leer`}
                  >
                    {vendorApplication?.unreadCount}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
