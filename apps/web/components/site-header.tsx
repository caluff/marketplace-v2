import type { HttpTypes } from "@medusajs/types"
import { LogOut, Menu, UserRound } from "lucide-react"
import Link from "next/link"

import { logoutCustomerAction } from "@/app/auth-actions"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SiteHeaderProps = {
  categories: HttpTypes.StoreProductCategory[]
  activeCategoryId?: string
  customer?: HttpTypes.StoreCustomer | null
}

function categoryHref(categoryId: string) {
  return `/?category_id=${encodeURIComponent(categoryId)}#catalog`
}

export function SiteHeader({
  categories,
  activeCategoryId,
  customer,
}: SiteHeaderProps) {
  const visibleCategories = categories.slice(0, 5)

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center justify-between gap-6 px-4 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-sans text-sm font-black tracking-[0.18em] uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          mercado / v2
        </Link>

        <nav
          aria-label="Navegación principal"
          className="hidden items-center gap-1 lg:flex"
        >
          <Link
            href="/"
            className="inline-flex min-h-11 items-center px-3 font-sans text-xs font-bold tracking-[0.1em] uppercase transition-colors hover:text-brand-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            Inicio
          </Link>
          <Link
            href="/#catalog"
            className="inline-flex min-h-11 items-center px-3 font-sans text-xs font-bold tracking-[0.1em] uppercase transition-colors hover:text-brand-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            Catálogo
          </Link>
          {visibleCategories.map((category) => (
            <Link
              key={category.id}
              href={categoryHref(category.id)}
              aria-current={
                activeCategoryId === category.id ? "page" : undefined
              }
              className={cn(
                "inline-flex min-h-11 max-w-40 items-center truncate px-3 font-sans text-xs font-bold tracking-[0.1em] uppercase transition-colors hover:text-brand-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                activeCategoryId === category.id && "text-brand-accent",
              )}
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <ModeToggle />
          <div className="hidden items-center gap-1 lg:flex">
            <Link
              href={customer ? "/account" : "/login"}
              className="inline-flex min-h-11 items-center gap-2 px-3 font-sans text-xs font-bold tracking-[0.08em] uppercase outline-none transition-colors hover:text-brand-accent focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <UserRound className="size-4" aria-hidden="true" />
              {customer?.first_name || (customer ? "Mi cuenta" : "Ingresar")}
            </Link>
            {customer ? (
              <form action={logoutCustomerAction}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                </Button>
              </form>
            ) : null}
          </div>
          <details className="group relative lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2 font-sans text-xs font-bold tracking-[0.1em] uppercase outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-3 focus-visible:ring-ring/40">
              <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
              Menú
            </summary>
            <nav
              aria-label="Navegación móvil"
              className="absolute top-[calc(100%+0.65rem)] right-0 w-[min(22rem,calc(100vw-2rem))] border border-border bg-background p-2 shadow-[6px_6px_0_var(--foreground)]"
            >
              <Link
                href="/"
                className="flex min-h-11 items-center border-b border-border px-3 font-sans text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                Inicio
              </Link>
              <Link
                href="/#catalog"
                className="flex min-h-11 items-center border-b border-border px-3 font-sans text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                Todo el catálogo
              </Link>
              {visibleCategories.map((category) => (
                <Link
                  key={category.id}
                  href={categoryHref(category.id)}
                  aria-current={
                    activeCategoryId === category.id ? "page" : undefined
                  }
                  className={cn(
                    "flex min-h-11 items-center border-b border-border px-3 font-sans text-sm font-semibold last:border-b-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                    activeCategoryId === category.id && "text-brand-accent",
                  )}
                >
                  {category.name}
                </Link>
              ))}
              <Link
                href={customer ? "/account" : "/login"}
                className="flex min-h-11 items-center gap-2 border-b border-border px-3 font-sans text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <UserRound className="size-4" aria-hidden="true" />
                {customer ? "Mi cuenta" : "Iniciar sesión"}
              </Link>
              {customer ? (
                <form action={logoutCustomerAction}>
                  <button
                    type="submit"
                    className="flex min-h-11 w-full items-center gap-2 px-3 font-sans text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Cerrar sesión
                  </button>
                </form>
              ) : null}
            </nav>
          </details>
        </div>
      </div>
    </header>
  )
}
