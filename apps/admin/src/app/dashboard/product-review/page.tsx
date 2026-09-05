import type { Metadata } from "next";
import { ProductReviewList } from "@/features/product-review/components/product-list";
import { listProductsForReview } from "@/features/product-review/data";
import { parseProductReviewFilters } from "@/features/product-review/helpers";

export const metadata: Metadata = {
  title: "Revisión del catálogo | Marketplace V2",
};

export default async function ProductReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseProductReviewFilters(await searchParams);
  return (
    <ProductReviewList
      filters={filters}
      result={await listProductsForReview(filters)}
    />
  );
}
