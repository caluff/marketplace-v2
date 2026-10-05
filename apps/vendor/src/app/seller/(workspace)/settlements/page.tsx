import type { Metadata } from "next";
import { Suspense } from "react";
import { SettlementList } from "@/features/settlements/list";
import { SettlementListSkeleton } from "@/features/settlements/view";
import {
  settlementListInput,
  type SettlementSearchParams,
} from "@/features/settlements/parameters";

export const metadata: Metadata = { title: "Cobros" };

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<SettlementSearchParams>;
}) {
  const input = settlementListInput(await searchParams);
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Cobros</h1>
      <Suspense key={input.page} fallback={<SettlementListSkeleton />}>
        <SettlementList input={input} />
      </Suspense>
    </div>
  );
}
