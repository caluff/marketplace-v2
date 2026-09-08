import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";

import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { getCurrentAdmin } from "@/lib/auth-sdk";
import {
  PendingApplicationsProvider,
  PendingApplicationsSeed,
} from "@/features/vendor-applications/components/pending-applications-provider";
import { getPendingApplicationStatus } from "@/features/vendor-applications/pending-action";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentAdmin();
  if (!user) redirect("/login?reason=expired&next=%2Fdashboard");

  return (
    <PendingApplicationsProvider>
      <Suspense fallback={null}>
        <PendingStatus />
      </Suspense>
      <div className="min-h-dvh bg-background">
        <AdminSidebar user={user} />
        <div className="min-h-dvh lg:pl-64">
          <AdminHeader user={user} />
          <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </PendingApplicationsProvider>
  );
}

async function PendingStatus() {
  return (
    <PendingApplicationsSeed status={await getPendingApplicationStatus()} />
  );
}
