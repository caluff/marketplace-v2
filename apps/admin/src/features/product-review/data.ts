import type { HttpTypes, ProductChangeDTO } from "@mercurjs/types";
import { FetchError } from "@medusajs/js-sdk";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { isProductReviewId, type parseProductReviewFilters } from "./helpers";

export async function listProductsForReview(
  filters: ReturnType<typeof parseProductReviewFilters>,
) {
  const sdk = await requireAdminSdk();
  // Mercur overrides the Medusa product response with change-review relations.
  return sdk.client.fetch<HttpTypes.AdminProductListResponse>(
    "/admin/products",
    {
      query: {
        q: filters.q || undefined,
        limit: filters.limit,
        offset: filters.offset,
        ...(filters.status === "all" ? {} : { status: [filters.status] }),
        fields: "id,title,status,handle,updated_at,changes.id,changes.status",
      },
      cache: "no-store",
    },
  );
}

export async function retrieveProductForReview(id: string) {
  if (!isProductReviewId(id))
    throw new FetchError("Invalid product ID", "Not Found", 404);
  const sdk = await requireAdminSdk();
  const [result, preview] = await Promise.all([
    sdk.client.fetch<HttpTypes.AdminProductResponse>(
      `/admin/products/${encodeURIComponent(id)}`,
      {
        query: {
          fields:
            "id,title,status,handle,description,subtitle,updated_at,categories.id,categories.name,variants.id,variants.title,changes.id,changes.status,changes.external_note,changes.created_at",
        },
        cache: "no-store",
      },
    ),
    sdk.client.fetch<{ product_change: ProductChangeDTO | null }>(
      `/admin/products/${encodeURIComponent(id)}/preview`,
      { cache: "no-store" },
    ),
  ]);
  const product: HttpTypes.AdminProductResponse["product"] = result.product;
  return { product, productChange: preview.product_change };
}
