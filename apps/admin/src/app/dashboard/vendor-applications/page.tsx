import type { Metadata } from "next";

import { ApplicationList } from "@/features/vendor-applications/components/application-list";
import { listVendorApplications } from "@/features/vendor-applications/data";
import { parseApplicationFilters } from "@/features/vendor-applications/helpers";

export const metadata: Metadata = {
  title: "Solicitudes de vendedores | Marketplace V2",
};

export default async function VendorApplicationsPage({
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
