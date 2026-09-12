"use client";

import type { LucideIcon } from "lucide-react";
import {
  BadgePercent,
  CircleHelp,
  ClipboardCheck,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Store,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { PendingApplicationsIndicator } from "@/features/vendor-applications/components/pending-applications-provider";

type NavigationItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
  current?: boolean;
};

const navigationGroups: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<NavigationItem>;
}> = [
  {
    label: "Visión general",
    items: [
      {
        label: "Resumen",
        icon: LayoutDashboard,
        href: "/dashboard",
      },
      {
        label: "Solicitudes",
        icon: ClipboardCheck,
        href: "/dashboard/vendor-applications",
      },
      { label: "Tiendas", icon: Store, href: "/dashboard/stores" },
      { label: "Catálogo", icon: Package, href: "/dashboard/product-review" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { label: "Pedidos", icon: ShoppingCart, href: "/dashboard/orders" },
      { label: "Atributos", icon: SlidersHorizontal },
      {
        label: "Comisiones",
        icon: BadgePercent,
        href: "/dashboard/commissions",
      },
    ],
  },
];

function NavigationLink({ item }: { item: NavigationItem }) {
  const { setOpenMobile } = useSidebar();
  const Icon = item.icon;

  if (!item.href) {
    return (
      <SidebarMenuButton
        disabled
        tooltip={`${item.label}: próximo`}
        aria-label={`${item.label}: próximo`}
        className="h-11 text-sidebar-muted md:h-9"
      >
        <Icon strokeWidth={1.8} aria-hidden="true" />
        <span>{item.label}</span>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.08em] group-data-[collapsible=icon]:hidden">
          Próximo
        </span>
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuButton
      asChild
      isActive={item.current}
      tooltip={item.label}
      className="h-11 text-sidebar-muted data-[active=true]:text-sidebar-accent-foreground md:h-9"
    >
      <Link
        href={item.href}
        aria-current={item.current ? "page" : undefined}
        data-testid={`admin-nav-${item.label.toLowerCase()}`}
        onNavigate={() => setOpenMobile(false)}
      >
        <Icon
          className={cn(item.current && "text-sidebar-primary")}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <span className="group-data-[collapsible=icon]:sr-only">
          {item.label}
        </span>
        {item.href === "/dashboard/vendor-applications" ? (
          <span className="ml-auto group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:right-0 group-data-[collapsible=icon]:top-0">
            <PendingApplicationsIndicator />
          </span>
        ) : null}
      </Link>
    </SidebarMenuButton>
  );
}

export function NavigationContent() {
  const pathname = usePathname();

  return (
    <>
      <nav aria-label="Navegación principal" className="flex-1">
        {navigationGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <NavigationLink
                      item={{
                        ...item,
                        current:
                          item.href === "/dashboard"
                            ? pathname === "/dashboard"
                            : Boolean(
                                item.href &&
                                !item.href.includes("#") &&
                                (pathname === item.href ||
                                  pathname.startsWith(`${item.href}/`)),
                              ),
                      }}
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </nav>

      <SidebarGroup>
        <div className="mb-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 group-data-[collapsible=icon]:hidden">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Conexión por módulo</span>
            <Badge className="border-sidebar-border bg-sidebar-accent text-[10px] text-sidebar-foreground">
              Mercur
            </Badge>
          </div>
          <p className="text-xs leading-4 text-sidebar-muted">
            Catálogo, tiendas y pedidos del marketplace. Las acciones respetan
            los permisos de tu cuenta de operador.
          </p>
        </div>
        <SidebarGroupContent className="border-t border-sidebar-border pt-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <NavigationLink
                item={{ label: "Configuración", icon: Settings }}
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <NavigationLink item={{ label: "Ayuda", icon: CircleHelp }} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
