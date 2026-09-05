"use client"

import { Heart, MapPin, Package, UserRound } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const links = [
  { href: "/account", label: "Información de la cuenta", icon: UserRound },
  { href: "/account/orders", label: "Mis órdenes", icon: Package },
  { href: "/account/addresses", label: "Mis direcciones", icon: MapPin },
  { href: "/account/favorites", label: "Favoritos", icon: Heart },
]

export function AccountNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Secciones de mi cuenta">
      <ul className="grid grid-cols-2 gap-1 lg:grid-cols-1">
        {links.map(({ href, label, icon: Icon }) => {
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
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
