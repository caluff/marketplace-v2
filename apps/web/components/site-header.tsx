import { Heart, UserRound } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { HeaderSearch } from "@/components/header-search"
import { CatalogMenu } from "@/components/catalog-menu"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { CustomerMenu } from "@/features/account/components/customer-menu"
import { CartLink } from "@/features/cart/components/cart-link"
import { getApplicationNavigation } from "@/features/vendor-onboarding/data"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import { getStorefrontCategories } from "@/lib/medusa"

async function CategoryLinks() {
  const categories = await getStorefrontCategories()

  return categories.map((category) => (
    <DropdownMenuItem key={category.id} asChild className="min-h-11 px-3">
      <Link href={`/search?category_id=${encodeURIComponent(category.id)}`}>
        {category.name}
      </Link>
    </DropdownMenuItem>
  ))
}

async function HeaderCustomerMenu() {
  let customer
  try {
    customer = await getCurrentCustomer()
  } catch {
    return (
      <Button asChild variant="ghost" size="icon" className="size-11">
        <Link href="/account" aria-label="Abrir mi cuenta">
          <UserRound className="size-5" aria-hidden="true" />
        </Link>
      </Button>
    )
  }

  if (!customer) {
    return (
      <Button asChild variant="ghost" size="icon" className="size-11">
        <Link href="/login" aria-label="Iniciar sesión" title="Iniciar sesión">
          <UserRound className="size-5" aria-hidden="true" />
        </Link>
      </Button>
    )
  }

  const vendorApplication = await getApplicationNavigation()

  return (
    <CustomerMenu
      first_name={customer.first_name}
      last_name={customer.last_name}
      email={customer.email}
      vendorApplication={vendorApplication}
    />
  )
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-border bg-background">
      <div className="mx-auto grid w-full max-w-[90rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-4 py-2 sm:gap-x-4 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-6 lg:px-10 lg:py-3">
        <Link
          href="/"
          aria-label="Marketplace V2, inicio"
          className="inline-flex min-h-11 min-w-0 items-center font-sans text-xs leading-5 font-black tracking-[0.14em] uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/40 sm:text-sm sm:tracking-[0.18em]"
        >
          Marketplace V2
        </Link>

        <div className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 pb-1 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:pb-0">
          <nav aria-label="Navegación principal" className="shrink-0">
            <CatalogMenu>
              <Suspense
                fallback={
                  <Skeleton
                    className="m-3 h-5 w-40"
                    aria-label="Cargando categorías"
                  />
                }
              >
                <CategoryLinks />
              </Suspense>
            </CatalogMenu>
          </nav>
          <HeaderSearch />
        </div>

        <div className="col-start-2 row-start-1 flex items-center gap-0 sm:gap-1 lg:col-start-3">
          <ModeToggle className="size-11" />
          <Button asChild variant="ghost" size="icon" className="size-11">
            <Link
              href="/account/favorites"
              aria-label="Favoritos"
              title="Favoritos"
            >
              <Heart aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </Link>
          </Button>
          <Suspense
            fallback={
              <Skeleton
                className="mx-1 h-11 w-12"
                aria-label="Cargando carrito"
              />
            }
          >
            <CartLink />
          </Suspense>
          <Suspense
            fallback={
              <Skeleton
                role="status"
                aria-label="Cargando cuenta"
                className="mx-1 size-9 rounded-full"
              />
            }
          >
            <HeaderCustomerMenu />
          </Suspense>
        </div>
      </div>
    </header>
  )
}
