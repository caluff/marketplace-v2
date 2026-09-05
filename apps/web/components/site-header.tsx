import type { HttpTypes } from "@medusajs/types"
import { Menu, UserRound } from "lucide-react"
import Link from "next/link"

import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { CustomerMenu } from "@/features/account/components/customer-menu"
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
    <header className="sticky top-0 z-40 border-b border-foreground/10 bg-background/55 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center justify-between gap-2 px-4 sm:gap-6 sm:px-6 lg:px-10">
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
          {customer ? (
            <CustomerMenu
              first_name={customer.first_name}
              last_name={customer.last_name}
              email={customer.email}
            />
          ) : (
            <Button asChild variant="ghost" className="hidden lg:inline-flex">
              <Link href="/login">
                <UserRound className="size-4" aria-hidden="true" />
                Ingresar
              </Link>
            </Button>
          )}
          <details className="group relative lg:hidden">
            <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 px-2 font-sans text-xs font-bold tracking-[0.1em] uppercase outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-3 focus-visible:ring-ring/40">
              <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
              <span className="sr-only sm:not-sr-only">Menú</span>
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
            </nav>
          </details>
        </div>
      </div>
    </header>
  )
}
