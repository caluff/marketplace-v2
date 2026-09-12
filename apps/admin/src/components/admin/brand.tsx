"use client";

import Link from "next/link";
import { Boxes } from "lucide-react";

import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";

export function Brand() {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenuButton size="lg" asChild tooltip="Marketplace">
      <Link
        href="/dashboard"
        data-testid="admin-brand-link"
        aria-label="Marketplace: control de operaciones"
        onNavigate={() => setOpenMobile(false)}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Boxes className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 group-data-[collapsible=icon]:sr-only">
          <span className="block truncate text-sm font-semibold tracking-[-0.02em]">
            Marketplace
          </span>
          <span className="block text-[11px] font-medium text-sidebar-muted">
            Control de operaciones
          </span>
        </span>
      </Link>
    </SidebarMenuButton>
  );
}
