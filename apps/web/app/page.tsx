import { CatalogSection } from "@/components/catalog-section"
import { Hero } from "@/components/hero"
import { SiteFooter } from "@/components/site-footer"
import { parseCatalogPage } from "@/features/catalog/catalog-navigation"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import { getStorefrontCatalog, getStorefrontCategories } from "@/lib/medusa"

export const dynamic = "force-dynamic"

type HomeProps = {
  searchParams: Promise<{
    category_id?: string | string[]
    page?: string | string[]
  }>
}

export default function Home({ searchParams }: HomeProps) {
  const activeCategoryId = searchParams.then((parameters) =>
    Array.isArray(parameters.category_id)
      ? parameters.category_id[0]
      : parameters.category_id,
  )
  const page = searchParams.then((parameters) => parseCatalogPage(parameters.page))
  const catalog = Promise.all([activeCategoryId, page]).then(([categoryId, page]) =>
    getStorefrontCatalog({ categoryId, page }),
  )
  const customer = getCurrentCustomer()
  const categories = getStorefrontCategories()

  return (
    <>
      <main>
        <Hero />
        <CatalogSection
          result={catalog}
          activeCategoryId={activeCategoryId}
          page={page}
          customer={customer}
        />
      </main>
      <SiteFooter categories={categories} />
    </>
  )
}
