import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ProductReviewBrowser,
  ProductReviewSkeleton,
} from "@/features/product-review/components/review-browser";

export const metadata: Metadata = {
  title: "Revisión del catálogo | Marketplace V2",
};

export default function ProductReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Revisión de productos
      </h1>
      <Suspense fallback={<ProductReviewSkeleton />}>
        <ProductReviewBrowser searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
