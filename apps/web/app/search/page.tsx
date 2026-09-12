import type { Metadata } from "next";
import { Suspense } from "react";

import { SiteFooter } from "@/components/site-footer";
import {
  SearchResults,
  SearchResultsSkeleton,
} from "@/features/search/components/search-results";
import type { SearchUrlParameters } from "@/features/search/parameters";
import { getStorefrontCategories } from "@/lib/medusa";

export const metadata: Metadata = {
  title: "Buscar productos | Marketplace V2",
  description:
    "Busca productos y filtra por categoría, tienda y precio en Marketplace V2.",
  robots: { index: false, follow: true },
};

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchUrlParameters>;
}) {
  return (
    <>
      <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 py-4 sm:px-6 lg:px-10 lg:py-5">
        <h1 className="sr-only">Buscar productos</h1>
        <Suspense fallback={<SearchResultsSkeleton />}>
          <SearchResults searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter categories={getStorefrontCategories()} />
    </>
  );
}
