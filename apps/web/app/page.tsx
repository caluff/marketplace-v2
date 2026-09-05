import { CatalogSection } from "@/components/catalog-section"
import { Hero } from "@/components/hero"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import { getStorefrontCatalog } from "@/lib/medusa"

export const dynamic = "force-dynamic"

type HomeProps = {
  searchParams: Promise<{
    category_id?: string | string[]
  }>
}

export default function Home({ searchParams }: HomeProps) {
  const activeCategoryId = searchParams.then((parameters) =>
    Array.isArray(parameters.category_id)
      ? parameters.category_id[0]
      : parameters.category_id,
  )
  const catalog = activeCategoryId.then((categoryId) =>
    getStorefrontCatalog({ categoryId }),
  )
  const customer = getCurrentCustomer()
  const categories = catalog.then((result) =>
    result.status === "products" || result.status === "empty"
      ? result.categories
      : [],
  )

  return (
    <>
      <SiteHeader
        categories={categories}
        activeCategoryId={activeCategoryId}
        customer={customer}
      />
      <main>
        <Hero />
        <CatalogSection
          result={catalog}
          activeCategoryId={activeCategoryId}
          customer={customer}
        />
      </main>
      <SiteFooter categories={categories} />
    </>
  )
}
