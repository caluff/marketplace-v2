import { Heart, PackageOpen } from "lucide-react"

import { ProductCard } from "@/components/product-card"
import { AccountHeading } from "@/features/account/components/account-heading"
import { AccountEmptyState } from "@/features/account/components/empty-state"
import { FavoriteButton } from "@/features/account/components/favorite-button"
import { AccountPagination } from "@/features/account/components/pagination"
import {
  ACCOUNT_PAGE_SIZE,
  getAccount,
  getPageNumber,
} from "@/features/account/data"
import { getFavoriteProductIds } from "@/features/account/favorites"

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const requestedPage = getPageNumber((await searchParams).page)
  const { customer, sdk } = await getAccount()
  const ids = getFavoriteProductIds(customer.metadata)
  const page = Math.min(
    requestedPage,
    Math.max(1, Math.ceil(ids.length / ACCOUNT_PAGE_SIZE)),
  )
  const pageIds = ids.slice(
    (page - 1) * ACCOUNT_PAGE_SIZE,
    page * ACCOUNT_PAGE_SIZE,
  )
  const { regions } = pageIds.length
    ? await sdk.store.region.list({ limit: 100, fields: "id,*countries" })
    : { regions: [] }
  const region = regions.find((entry) =>
    entry.countries?.some((country) => country.iso_2 === "us"),
  )
  const { products } = pageIds.length
    ? await sdk.store.product.list({
        id: pageIds,
        limit: ACCOUNT_PAGE_SIZE,
        ...(region ? { region_id: region.id } : {}),
        fields: region
          ? "id,title,subtitle,description,handle,thumbnail,*images,*categories,*variants.calculated_price"
          : "id,title,subtitle,description,handle,thumbnail,*images,*categories",
      })
    : { products: [] }
  const productsById = new Map(products.map((product) => [product.id, product]))
  return (
    <>
      <AccountHeading
        title="Mis favoritos"
        description="Todo eso que quieres volver a mirar. Guarda productos desde el catálogo y encuéntralos aquí cuando vuelvas."
      />
      {ids.length === 0 ? (
        <AccountEmptyState
          icon={<Heart aria-hidden="true" strokeWidth={1.5} />}
          title="Tu próxima elección empieza aquí"
        >
          Toca el corazón de un producto para guardarlo en tu cuenta.
        </AccountEmptyState>
      ) : (
        <>
          <p className="mb-5 text-xs text-muted-foreground">
            {ids.length}{" "}
            {ids.length === 1 ? "producto guardado" : "productos guardados"}
          </p>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {pageIds.map((id, index) => {
              const product = productsById.get(id)
              return product ? (
                <ProductCard
                  key={id}
                  product={product}
                  index={(page - 1) * ACCOUNT_PAGE_SIZE + index}
                  isFavorite
                  authenticated
                />
              ) : (
                <div
                  key={id}
                  className="flex min-h-64 flex-col items-center justify-center gap-5 border border-dashed border-border p-6 text-center"
                >
                  <PackageOpen
                    className="size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-muted-foreground">
                    Este producto ya no está disponible.
                  </p>
                  <FavoriteButton productId={id} saved authenticated />
                </div>
              )
            })}
          </div>
          <AccountPagination
            page={page}
            count={ids.length}
            pageSize={ACCOUNT_PAGE_SIZE}
            href="/account/favorites"
          />
        </>
      )}
    </>
  )
}
