import type { HttpTypes } from "@medusajs/types"
import { Menu, UserRound } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CustomerMenu } from "@/features/account/components/customer-menu"
import { ApplicationReminder } from "@/features/vendor-onboarding/components/application-reminder"
import { getApplicationNavigation } from "@/features/vendor-onboarding/data"
import {
  APPLICATION_LOGIN_PATH,
  applicationNavigation,
  type ApplicationNavigation,
} from "@/features/vendor-onboarding/presentation"
import { cn } from "@/lib/utils"

type SiteHeaderProps = {
  categories:
    HttpTypes.StoreProductCategory[] | Promise<HttpTypes.StoreProductCategory[]>
  activeCategoryId?: string | Promise<string | undefined>
  customer?:
    HttpTypes.StoreCustomer | null | Promise<HttpTypes.StoreCustomer | null>
  vendorApplication?: ApplicationNavigation
}

function categoryHref(categoryId: string) {
  return `/?category_id=${encodeURIComponent(categoryId)}#catalog`
}

async function CategoryLinks({
  categories,
  activeCategoryId,
  mobile = false,
}: Pick<SiteHeaderProps, "categories" | "activeCategoryId"> & {
  mobile?: boolean
}) {
  const [resolvedCategories, resolvedActiveCategoryId] = await Promise.all([
    categories,
    activeCategoryId,
  ])

  return resolvedCategories.slice(0, 5).map((category) => (
    <Link
      key={category.id}
      href={categoryHref(category.id)}
      aria-current={
        resolvedActiveCategoryId === category.id ? "page" : undefined
      }
      className={cn(
        mobile
          ? "flex min-h-11 items-center border-b border-border px-3 font-sans text-sm font-semibold last:border-b-0 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          : "inline-flex min-h-11 max-w-40 items-center truncate px-3 font-sans text-xs font-bold tracking-[0.1em] uppercase transition-colors hover:text-brand-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        resolvedActiveCategoryId === category.id && "text-brand-accent",
      )}
    >
      {category.name}
    </Link>
  ))
}

type HeaderCustomerProps = {
  customer: SiteHeaderProps["customer"]
  vendorApplication: Promise<ApplicationNavigation>
}

async function HeaderApplicationReminder({
  customer,
  vendorApplication,
  className,
}: HeaderCustomerProps & { className: string }) {
  const [resolvedCustomer, navigation] = await Promise.all([
    customer,
    vendorApplication,
  ])

  return (
    <ApplicationReminder
      navigation={navigation}
      href={resolvedCustomer ? "/account/sell" : APPLICATION_LOGIN_PATH}
      className={className}
    />
  )
}

async function HeaderCustomerMenu({
  customer,
  vendorApplication,
}: HeaderCustomerProps) {
  const resolvedCustomer = await customer

  if (!resolvedCustomer) {
    return (
      <Button asChild variant="ghost" className="hidden lg:inline-flex">
        <Link href="/login">
          <UserRound className="size-4" aria-hidden="true" />
          Ingresar
        </Link>
      </Button>
    )
  }

  return (
    <CustomerMenu
      first_name={resolvedCustomer.first_name}
      last_name={resolvedCustomer.last_name}
      email={resolvedCustomer.email}
      vendorApplication={await vendorApplication}
    />
  )
}

async function MobileAccountLink({
  customer,
}: Pick<SiteHeaderProps, "customer">) {
  const resolvedCustomer = await customer

  return (
    <Link
      href={resolvedCustomer ? "/account" : "/login"}
      className="flex min-h-11 items-center gap-2 border-b border-border px-3 font-sans text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
    >
      <UserRound className="size-4" aria-hidden="true" />
      {resolvedCustomer ? "Mi cuenta" : "Iniciar sesión"}
    </Link>
  )
}

export function SiteHeader({
  categories,
  activeCategoryId,
  customer,
  vendorApplication: suppliedVendorApplication,
}: SiteHeaderProps) {
  const vendorApplication = suppliedVendorApplication
    ? Promise.resolve(suppliedVendorApplication)
    : Promise.resolve(customer).then((resolvedCustomer) =>
        resolvedCustomer
          ? getApplicationNavigation()
          : applicationNavigation(null),
      )

  return (
    <header className="sticky top-0 z-40 border-b border-foreground/10 bg-background/55 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center justify-between gap-2 px-4 sm:gap-6 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center font-sans text-sm font-black tracking-[0.18em] uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          Marketplace V2
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
          <Suspense fallback={<Skeleton className="mx-3 h-4 w-24" />}>
            <CategoryLinks
              categories={categories}
              activeCategoryId={activeCategoryId}
            />
          </Suspense>
        </nav>

        <div className="flex items-center gap-1">
          <Suspense
            fallback={<Skeleton className="mx-3 hidden h-4 w-24 xl:block" />}
          >
            <HeaderApplicationReminder
              customer={customer}
              vendorApplication={vendorApplication}
              className="hidden xl:flex"
            />
          </Suspense>
          <ModeToggle />
          <Suspense
            fallback={
              <Skeleton
                role="status"
                aria-label="Cargando cuenta"
                className="mx-1 size-9 rounded-full"
              />
            }
          >
            <HeaderCustomerMenu
              customer={customer}
              vendorApplication={vendorApplication}
            />
          </Suspense>
          <details className="group relative lg:hidden">
            <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 px-2 font-sans text-xs font-bold tracking-[0.1em] uppercase outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-3 focus-visible:ring-ring/40">
              <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
              <span className="sr-only sm:not-sr-only">Menú</span>
            </summary>
            <nav
              aria-label="Navegación móvil"
              className="absolute top-[calc(100%+0.65rem)] right-0 w-[min(22rem,calc(100vw-2rem))] border border-border bg-background p-2 shadow-[6px_6px_0_var(--foreground)]"
            >
              <Suspense fallback={<Skeleton className="m-3 h-5 w-36" />}>
                <HeaderApplicationReminder
                  customer={customer}
                  vendorApplication={vendorApplication}
                  className="flex justify-between"
                />
              </Suspense>
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
              <Suspense fallback={<Skeleton className="m-3 h-5 w-28" />}>
                <CategoryLinks
                  categories={categories}
                  activeCategoryId={activeCategoryId}
                  mobile
                />
              </Suspense>
              <Suspense
                fallback={
                  <Skeleton
                    role="status"
                    aria-label="Cargando cuenta"
                    className="m-3 h-5 w-28"
                  />
                }
              >
                <MobileAccountLink customer={customer} />
              </Suspense>
            </nav>
          </details>
        </div>
      </div>
    </header>
  )
}
