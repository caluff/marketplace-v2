import type { Metadata } from "next";
import { Suspense } from "react";
import LoadingVendorApplications from "./loading";

import { ApplicationList } from "@/features/vendor-applications/components/application-list";
import { listVendorApplications } from "@/features/vendor-applications/data";
import { parseApplicationFilters } from "@/features/vendor-applications/helpers";

export const metadata: Metadata = {
  title: "Solicitudes de vendedores | Marketplace V2",
};

export default function VendorApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          Vendedores · Onboarding
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Solicitudes de vendedores
        </h1>
      </div>
      <Suspense fallback={<LoadingVendorApplications />}>
        <ApplicationQueue searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ApplicationQueue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseApplicationFilters(await searchParams);
  return (
    <ApplicationList
      filters={filters}
      result={await listVendorApplications(filters)}
    />
  );
}
