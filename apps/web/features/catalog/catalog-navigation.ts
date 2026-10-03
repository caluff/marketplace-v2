import type { StorefrontCatalogResult } from "@/lib/medusa"

export const CATALOG_PAGE_SIZE = 12

export function parseCatalogPage(value: string | string[] | number | undefined) {
  const page = Number(Array.isArray(value) ? value[0] : value)
  return Number.isSafeInteger(page) &&
    page > 0 &&
    Number.isSafeInteger((page - 1) * CATALOG_PAGE_SIZE)
    ? page
    : 1
}

export function catalogHref({
  categoryId,
  page = 1,
}: {
  categoryId?: string
  page?: number
}) {
  const query = new URLSearchParams()
  if (categoryId) query.set("category_id", categoryId)
  if (page > 1) query.set("page", String(page))
  return `/${query.size ? `?${query}` : ""}#catalog`
}

export function getCatalogPagination(
  result: StorefrontCatalogResult,
  categoryId?: string,
) {
  if (result.status !== "products" && result.status !== "out_of_range")
    return null

  const lastPage = Math.max(1, Math.ceil(result.count / CATALOG_PAGE_SIZE))
  return {
    lastPage,
    recoveryHref: catalogHref({ categoryId, page: lastPage }),
    previousHref:
      result.status === "products" && result.page > 1
        ? catalogHref({ categoryId, page: result.page - 1 })
        : null,
    nextHref:
      result.status === "products" && result.page < lastPage
        ? catalogHref({ categoryId, page: result.page + 1 })
        : null,
  }
}
