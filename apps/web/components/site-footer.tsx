import type { HttpTypes } from "@medusajs/types"
import { ArrowUpRight } from "lucide-react"
import Link from "next/link"

type SiteFooterProps = {
  categories: HttpTypes.StoreProductCategory[]
}

export function SiteFooter({ categories }: SiteFooterProps) {
  return (
    <footer className="border-t border-border bg-primary text-primary-foreground">
      <div className="mx-auto grid w-full max-w-[90rem] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr] lg:px-10 lg:py-16">
        <div>
          <p className="font-sans text-xs font-bold tracking-[0.18em] uppercase opacity-70">
            mercado / v2
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
                href="/#catalog"
                className="flex min-h-11 items-center gap-2 font-sans text-sm font-semibold outline-none hover:text-accent focus-visible:ring-3 focus-visible:ring-accent/60"
              >
                Todo el catálogo
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </li>
            {categories.slice(0, 5).map((category) => (
              <li key={category.id}>
                <Link
                  href={`/?category_id=${encodeURIComponent(category.id)}#catalog`}
                  className="flex min-h-11 items-center font-sans text-sm font-semibold outline-none hover:text-accent focus-visible:ring-3 focus-visible:ring-accent/60"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-primary-foreground/20">
        <div className="mx-auto flex min-h-14 w-full max-w-[90rem] items-center px-4 font-sans text-xs opacity-70 sm:px-6 lg:px-10">
          © {new Date().getFullYear()} mercado / v2
        </div>
      </div>
    </footer>
  )
}
