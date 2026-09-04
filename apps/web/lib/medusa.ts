import Medusa from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"

import {
  classifyCatalogError,
  getCatalogContentStatus,
  type CatalogFailureStatus,
  withTimeout,
} from "@/lib/catalog-state"
import { validateStorefrontEnvironment } from "@/lib/storefront-config"

const CATALOG_LIMIT = 12
const STORE_API_TIMEOUT_MS = 8_000

const storefrontConfiguration = validateStorefrontEnvironment({
  NEXT_PUBLIC_MEDUSA_BACKEND_URL:
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

/**
 * The single SDK instance used by the storefront. Built-in Store API routes
 * are called through their typed SDK methods; future custom routes should use
 * sdk.client.fetch instead of the platform fetch API.
 */
export const sdk =
  storefrontConfiguration.status === "valid"
    ? new Medusa({
        baseUrl: storefrontConfiguration.config.baseUrl,
        publishableKey: storefrontConfiguration.config.publishableKey,
        debug: process.env.NODE_ENV === "development",
      })
    : null

type CatalogData = {
  categories: HttpTypes.StoreProductCategory[]
}

export type StorefrontCatalogResult =
  | ({
      status: "products"
      products: HttpTypes.StoreProduct[]
      count: number
    } & CatalogData)
  | ({ status: "empty"; products: []; count: 0 } & CatalogData)
  | {
      status: "configuration_missing"
      missing: Array<"backend_url" | "publishable_key">
    }
  | { status: "invalid_backend_url" }
  | { status: "invalid_publishable_key" }
  | { status: CatalogFailureStatus }

function configurationFailure(): StorefrontCatalogResult | null {
  if (storefrontConfiguration.status === "missing") {
    return {
      status: "configuration_missing",
      missing: storefrontConfiguration.missing,
    }
  }

  if (storefrontConfiguration.status === "invalid_backend_url") {
    return { status: "invalid_backend_url" }
  }

  if (storefrontConfiguration.status === "invalid_publishable_key") {
    return { status: "invalid_publishable_key" }
  }

  return null
}

export async function getStorefrontCatalog(options?: {
  categoryId?: string
}): Promise<StorefrontCatalogResult> {
  const invalidConfiguration = configurationFailure()

  if (invalidConfiguration || !sdk) {
    return invalidConfiguration ?? { status: "store_api_error" }
  }

  const categoryId = options?.categoryId?.trim()

  try {
    const result = await withTimeout(
      (async () => {
        const [regionResponse, categoryResponse] = await Promise.all([
          sdk.store.region.list({
            limit: 1,
            fields: "id,currency_code",
          }),
          sdk.store.category.list({
            limit: 7,
            parent_category_id: null,
            fields: "id,name,handle,parent_category_id",
          }),
        ])

        const region = regionResponse.regions[0]
        const query: HttpTypes.StoreProductListParams = {
          limit: CATALOG_LIMIT,
          fields: region
            ? "id,title,subtitle,description,handle,thumbnail,*images,*variants.calculated_price,*categories"
            : "id,title,subtitle,description,handle,thumbnail,*images,*categories",
        }

        if (region) {
          query.region_id = region.id
        }

        if (categoryId && categoryId.length <= 128) {
          query.category_id = categoryId
        }

        const productResponse = await sdk.store.product.list(query)

        return {
          products: productResponse.products,
          count: productResponse.count,
          categories: categoryResponse.product_categories,
        }
      })(),
      STORE_API_TIMEOUT_MS,
    )

    if (getCatalogContentStatus(result.products) === "empty") {
      return {
        status: "empty",
        products: [],
        count: 0,
        categories: result.categories,
      }
    }

    return {
      status: "products",
      products: result.products,
      count: result.count,
      categories: result.categories,
    }
  } catch (error: unknown) {
    return { status: classifyCatalogError(error) }
  }
}
