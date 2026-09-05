"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  LayoutDashboard,
  Menu,
  PackageSearch,
  Settings2,
  ShoppingBag,
  Store,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { VendorUserMenu } from "./vendor-user-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { vendorRoutes, type VendorRouteId } from "@/lib/vendor-routes";

type VendorIdentity = {
  memberName: string;
  memberEmail: string;
  sellerName: string;
  roleId: string;
};

const roleLabels: Record<string, string> = {
  role_seller_administration: "Administración",
  role_seller_inventory_management: "Inventario",
  role_seller_order_management: "Pedidos",
  role_seller_accounting: "Contabilidad",
  role_seller_support: "Soporte",
};

const routeIcons = {
  dashboard: LayoutDashboard,
  catalog: PackageSearch,
  orders: ShoppingBag,
  inventory: Boxes,
  settings: Settings2,
} satisfies Record<VendorRouteId, typeof LayoutDashboard>;

function Brand() {
  return (
    <Link
      href="/seller"
      className="flex min-h-11 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
        <Store className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-lg leading-5">
          Marketplace V2
        </span>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/55">
          Portal vendedor
        </span>
      </span>
    </Link>
  );
}

function SidebarContent({
  pathname,
  identity,
  canSwitchSeller,
  mobile,
}: {
  pathname: string;
  identity: VendorIdentity;
  canSwitchSeller: boolean;
  mobile?: boolean;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-5"
        data-testid="vendor-sidebar-brand"
      >
        <Brand />
      </div>
      <nav
        aria-label="Navegación del vendedor"
        className="min-h-0 flex-1 overflow-y-auto px-3 py-5"
      >
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/45">
          Operación
        </p>
        <ul className="space-y-1">
          {vendorRoutes.map((route) => {
            const Icon = routeIcons[route.id];
            const isCurrent =
              route.href === "/seller"
                ? pathname === route.href
                : pathname.startsWith(route.href);
            const link = (
              <Link
                href={route.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  isCurrent
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/68 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-[18px]",
                    isCurrent
                      ? "text-sidebar-primary"
                      : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/70",
                  )}
                  aria-hidden="true"
                />
                <span>{route.label}</span>
              </Link>
            );

            return (
              <li key={route.href}>
                {mobile ? <SheetClose asChild>{link}</SheetClose> : link}
              </li>
            );
          })}
        </ul>
      </nav>
      <VendorUserMenu
        {...identity}
        roleLabel={roleLabels[identity.roleId] ?? identity.roleId}
        canSwitchSeller={canSwitchSeller}
      />
    </div>
  );
}

export function VendorShell({
  children,
  identity,
  canSwitchSeller,
}: {
  children: ReactNode;
  identity: VendorIdentity;
  canSwitchSeller: boolean;
}) {
  const pathname = usePathname();
  const currentRoute = vendorRoutes.find((route) =>
    route.href === "/seller"
      ? pathname === route.href
      : pathname.startsWith(route.href),
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#vendor-content"
        className="fixed left-4 top-3 z-[70] -translate-y-20 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-transform focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border md:block">
        <SidebarContent
          pathname={pathname}
          identity={identity}
          canSwitchSeller={canSwitchSeller}
        />
      </aside>
      <div className="min-h-screen md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border/75 bg-background/88 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="mr-3 size-11 md:hidden"
                aria-label="Abrir navegación"
              >
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[292px] border-sidebar-border p-0"
            >
              <SheetTitle className="sr-only">
                Navegación del vendedor
              </SheetTitle>
              <SheetDescription className="sr-only">
                Enlaces principales del portal de vendedor.
              </SheetDescription>
              <SidebarContent
                pathname={pathname}
                identity={identity}
                canSwitchSeller={canSwitchSeller}
                mobile
              />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground">
              {identity.sellerName}
            </p>
            <p className="truncate text-sm font-bold">
              {currentRoute?.label ?? "Portal vendedor"}
            </p>
          </div>
        </header>
        <main
          id="vendor-content"
          className="vendor-canvas min-h-[calc(100vh-4rem)] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
