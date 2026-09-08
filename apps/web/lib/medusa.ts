import type { HttpTypes } from "@medusajs/types"
import { cache } from "react"
import { createCatalogSdk } from "@/lib/catalog-sdk"

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
  NEXT_PUBLIC_MEDUSA_BACKEND_URL: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

export type StorefrontCatalogResult =
  | {
      status: "products"
      products: HttpTypes.StoreProduct[]
      count: number
    }
  | { status: "empty"; products: []; count: 0 }
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

  if (invalidConfiguration || storefrontConfiguration.status !== "valid") {
    return invalidConfiguration ?? { status: "store_api_error" }
  }

  const categoryId = options?.categoryId?.trim()
  const deadline = Date.now() + STORE_API_TIMEOUT_MS

  try {
    const region = await getCatalogRegion()
    const config = storefrontConfiguration.config
    const result = await withTimeout(
      async (signal) => {
        const sdk = createCatalogSdk(config, signal)
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
        }
      },
      Math.max(1, deadline - Date.now()),
    )

    if (getCatalogContentStatus(result.products) === "empty") {
      return {
        status: "empty",
        products: [],
        count: 0,
      }
    }

    return {
      status: "products",
      products: result.products,
      count: result.count,
    }
  } catch (error: unknown) {
    return { status: classifyCatalogError(error) }
  }
}

// Request-scoped reuse only. Admin and Store are independent deployments;
// persistent caching needs a cross-app invalidation contract before adoption.
const getCatalogRegion = cache(async () => {
  if (storefrontConfiguration.status !== "valid") return undefined
  const config = storefrontConfiguration.config
  return withTimeout(async (signal) => {
    const { regions } = await createCatalogSdk(
      config,
      signal,
    ).store.region.list({
      limit: 1,
      fields: "id,currency_code",
    })
    return regions[0]
  }, STORE_API_TIMEOUT_MS)
})

export const getStorefrontCategories = cache(
  async (): Promise<HttpTypes.StoreProductCategory[]> => {
    if (storefrontConfiguration.status !== "valid") return []
    const config = storefrontConfiguration.config
    try {
      return await withTimeout(async (signal) => {
        const response = await createCatalogSdk(
          config,
          signal,
        ).store.category.list({
          limit: 7,
          parent_category_id: null,
          fields: "id,name,handle,parent_category_id",
        })
        return response.product_categories
      }, STORE_API_TIMEOUT_MS)
    } catch {
      return []
    }
  },
)
