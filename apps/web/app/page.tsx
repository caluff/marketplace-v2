import { CatalogSection } from "@/components/catalog-section"
import { Hero } from "@/components/hero"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import { getStorefrontCatalog } from "@/lib/medusa"
import { getFavoriteProductIds } from "@/features/account/favorites"

export const dynamic = "force-dynamic"

type HomeProps = {
  searchParams: Promise<{
    category_id?: string | string[]
  }>
}

export default async function Home({ searchParams }: HomeProps) {
  const parameters = await searchParams
  const activeCategoryId = Array.isArray(parameters.category_id)
    ? parameters.category_id[0]
    : parameters.category_id
  const [catalog, customer] = await Promise.all([
    getStorefrontCatalog({ categoryId: activeCategoryId }),
    getCurrentCustomer(),
  ])
  const categories =
    catalog.status === "products" || catalog.status === "empty"
      ? catalog.categories
      : []

  return (
    <>
      <SiteHeader
        categories={categories}
        activeCategoryId={activeCategoryId}
        customer={customer}
      />
      <main>
        <Hero
          productCount={
            catalog.status === "products" ? catalog.count : undefined
          }
        />
        <CatalogSection
          result={catalog}
          activeCategoryId={activeCategoryId}
          authenticated={Boolean(customer)}
          favoriteProductIds={getFavoriteProductIds(customer?.metadata)}
        />
      </main>
      <SiteFooter categories={categories} />
    </>
  )
}
