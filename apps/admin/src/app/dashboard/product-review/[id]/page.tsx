import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductReviewDetail } from "@/features/product-review/components/product-detail";
import { retrieveProductForReview } from "@/features/product-review/data";
import { isProductReviewId } from "@/features/product-review/helpers";

export const metadata: Metadata = { title: "Revisar producto | Marketplace V2" };

export default async function ProductReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isProductReviewId(id)) notFound();
  return <ProductReviewDetail {...await retrieveProductForReview(id)} />;
}
