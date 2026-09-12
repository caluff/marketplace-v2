"use client";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { vendorRoutes } from "@/lib/vendor-routes";

export function VendorHeader({ sellerName }: { sellerName: string }) {
  const pathname = usePathname();
  const currentRoute = vendorRoutes.find(
    (route) =>
      pathname === route.href ||
      (route.href !== "/seller" && pathname.startsWith(`${route.href}/`)),
  );

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/75 bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <SidebarTrigger className="size-11 md:size-8" />
      <Separator aria-orientation="vertical" className="h-4 w-px" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-muted-foreground">
          {sellerName}
        </p>
        <p className="truncate text-sm font-bold">
          {currentRoute?.label ?? "Portal vendedor"}
        </p>
      </div>
    </header>
  );
}
