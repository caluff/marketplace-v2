import type { HttpTypes } from "@medusajs/types"
import { ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"
import { catalogHref } from "@/features/catalog/catalog-navigation"

type SiteFooterProps = {
  categories:
    HttpTypes.StoreProductCategory[] | Promise<HttpTypes.StoreProductCategory[]>
}

async function FooterCategories({ categories }: SiteFooterProps) {
  return (await categories).slice(0, 5).map((category) => (
    <li key={category.id}>
      <Link
        href={catalogHref({ categoryId: category.id })}
        className="flex min-h-11 items-center font-sans text-sm font-semibold outline-none hover:text-cover-accent-cyan focus-visible:ring-3 focus-visible:ring-cover-accent-cyan/60"
      >
        {category.name}
      </Link>
    </li>
  ))
}

export function SiteFooter({ categories }: SiteFooterProps) {
  return (
    <footer className="border-t border-border bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr] lg:px-10 lg:py-16">
        <div>
          <p className="font-sans text-xs font-bold tracking-[0.18em] uppercase opacity-70">
            usapeek
          </p>
          <p className="mt-5 max-w-lg text-3xl leading-tight sm:text-4xl">
            Una vidriera serena para elegir con criterio.
          </p>
        </div>

        <nav aria-label="Navegación del pie">
          <p className="font-sans text-xs font-bold tracking-[0.16em] uppercase opacity-70">
            Explorar
          </p>
          <ul className="mt-4 grid gap-1 sm:grid-cols-2">
            <li>
              <Link
                href="/search"
                className="flex min-h-11 items-center gap-2 font-sans text-sm font-semibold outline-none hover:text-cover-accent-cyan focus-visible:ring-3 focus-visible:ring-cover-accent-cyan/60"
              >
                Todo el catálogo
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </li>
            <Suspense fallback={null}>
              <FooterCategories categories={categories} />
            </Suspense>
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex min-h-14 w-full max-w-[90rem] flex-col items-start justify-between gap-2 px-4 py-3 font-sans text-xs sm:flex-row sm:items-center sm:px-6 lg:px-10">
          <p className="text-muted-foreground">
            © {new Date().getFullYear()} usapeek
          </p>
          <nav aria-label="Información legal">
            <ul className="flex flex-wrap gap-x-6">
              <li>
                <Link
                  href="/terms"
                  className="inline-flex min-h-11 items-center text-muted-foreground outline-none hover:text-brand-accent focus-visible:ring-3 focus-visible:ring-brand-accent/60"
                >
                  Términos y condiciones
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="inline-flex min-h-11 items-center text-muted-foreground outline-none hover:text-brand-accent focus-visible:ring-3 focus-visible:ring-brand-accent/60"
                >
                  Política de privacidad
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}
