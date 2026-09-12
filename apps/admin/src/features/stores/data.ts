import type Medusa from "@medusajs/js-sdk";
import type { HttpTypes } from "@mercurjs/types";
import type { parseStoreFilters } from "./helpers";

export function listStores(
  sdk: Medusa,
  filters: ReturnType<typeof parseStoreFilters>,
) {
  return sdk.client.fetch<HttpTypes.AdminSellerListResponse>("/admin/sellers", {
    query: {
      q: filters.q || undefined,
      status: filters.status === "all" ? undefined : filters.status,
      limit: filters.limit,
      offset: filters.offset,
      order: "name",
      fields: "id,name,handle,email,status,currency_code",
    },
    cache: "no-store",
  });
}

export function retrieveStore(sdk: Medusa, id: string) {
  return sdk.client.fetch<HttpTypes.AdminSellerResponse>(
    `/admin/sellers/${encodeURIComponent(id)}`,
    {
      query: {
        fields:
          "id,name,handle,email,phone,description,website_url,currency_code,status,status_reason,is_premium,*professional_details,*address",
      },
      cache: "no-store",
    },
  );
}
