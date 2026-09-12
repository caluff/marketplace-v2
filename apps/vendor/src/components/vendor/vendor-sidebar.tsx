"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  LayoutDashboard,
  PackageSearch,
  Settings2,
  ShoppingBag,
  Store,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { vendorRoutes, type VendorRouteId } from "@/lib/vendor-routes";
import { VendorUserMenu } from "./vendor-user-menu";

export type VendorIdentity = {
  memberName: string;
  memberEmail: string;
  sellerName: string;
  roleId: string;
};

const ROLE_LABELS: Record<string, string> = {
  role_seller_administration: "Administración",
  role_seller_inventory_management: "Inventario",
  role_seller_order_management: "Pedidos",
  role_seller_accounting: "Contabilidad",
  role_seller_support: "Soporte",
};

const ROUTE_ICONS = {
  dashboard: LayoutDashboard,
  catalog: PackageSearch,
  orders: ShoppingBag,
  inventory: Boxes,
  settings: Settings2,
} satisfies Record<VendorRouteId, typeof LayoutDashboard>;

export function VendorSidebar({
  identity,
  canSwitchSeller,
}: {
  identity: VendorIdentity;
  canSwitchSeller: boolean;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader
        className="h-16 justify-center border-b border-sidebar-border"
        data-testid="vendor-sidebar-brand"
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip={identity.sellerName}>
              <Link href="/seller" onNavigate={() => setOpenMobile(false)}>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Store className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 group-data-[collapsible=icon]:sr-only">
                  <span className="block truncate font-display text-base font-semibold">
                    {identity.sellerName}
                  </span>
                  <span className="block text-xs text-sidebar-foreground/70">
                    Portal vendedor
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Navegación del vendedor">
          <SidebarGroup>
            <SidebarGroupLabel>Operación</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {vendorRoutes.map((route) => {
                  const Icon = ROUTE_ICONS[route.id];
                  const isCurrent =
                    pathname === route.href ||
                    (route.href !== "/seller" &&
                      pathname.startsWith(`${route.href}/`));

                  return (
                    <SidebarMenuItem key={route.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isCurrent}
                        tooltip={route.label}
                        className="h-11 md:h-9"
                      >
                        <Link
                          href={route.href}
                          aria-current={isCurrent ? "page" : undefined}
                          onNavigate={() => setOpenMobile(false)}
                        >
                          <Icon aria-hidden="true" />
                          <span>{route.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <VendorUserMenu
          {...identity}
          roleLabel={ROLE_LABELS[identity.roleId] ?? identity.roleId}
          canSwitchSeller={canSwitchSeller}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
