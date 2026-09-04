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

import { Badge } from "@/components/ui/badge";
import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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
        current: true,
      },
      {
        label: "Solicitudes",
        icon: ClipboardCheck,
        href: "/dashboard#requests",
      },
      { label: "Tiendas", icon: Store, href: "/dashboard#stores" },
      { label: "Catálogo", icon: Package, href: "/dashboard#catalog" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { label: "Pedidos", icon: ShoppingCart },
      { label: "Atributos", icon: SlidersHorizontal },
      { label: "Comisiones", icon: BadgePercent },
    ],
  },
];

function NavigationLink({
  item,
  mobile,
}: {
  item: NavigationItem;
  mobile: boolean;
}) {
  const Icon = item.icon;

  if (!item.href) {
    return (
      <div
        aria-disabled="true"
        className="flex h-9 cursor-not-allowed items-center gap-3 rounded-md px-2.5 text-sm text-sidebar-muted/70"
      >
        <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
        <span className="flex-1">{item.label}</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.08em]">
          Próximo
        </span>
      </div>
    );
  }

  const link = (
    <Link
      href={item.href}
      aria-current={item.current ? "page" : undefined}
      data-testid={`admin-nav-${item.label.toLowerCase()}`}
      className={cn(
        "group flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        item.current
          ? "bg-sidebar-accent text-sidebar-foreground shadow-[inset_0_0_0_1px_oklch(1_0_0/0.06)]"
          : "text-sidebar-muted hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-4",
          item.current
            ? "text-sidebar-primary"
            : "text-sidebar-muted transition-colors group-hover:text-sidebar-foreground",
        )}
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <span>{item.label}</span>
    </Link>
  );

  return mobile ? <SheetClose asChild>{link}</SheetClose> : link;
}

export function NavigationContent({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Navegación principal" className="flex-1 px-3 py-5">
        <div className="space-y-6">
          {navigationGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted/70">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavigationLink
                    key={item.label}
                    item={item}
                    mobile={mobile}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="px-3 pb-3">
        <div className="mb-3 rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold">Entorno visual</span>
            <Badge className="border-white/10 bg-white/8 text-[10px] text-sidebar-foreground">
              Demo
            </Badge>
          </div>
          <p className="text-xs leading-4 text-sidebar-muted">
            Datos estáticos. No hay acciones administrativas conectadas.
          </p>
        </div>

        <div className="space-y-0.5 border-t border-sidebar-border pt-3">
          <div className="flex h-9 cursor-not-allowed items-center gap-3 rounded-md px-2.5 text-sm text-sidebar-muted/70">
            <Settings className="size-4" strokeWidth={1.8} aria-hidden="true" />
            <span className="flex-1">Configuración</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.08em]">
              Próximo
            </span>
          </div>
          <div className="flex h-9 cursor-not-allowed items-center gap-3 rounded-md px-2.5 text-sm text-sidebar-muted/70">
            <CircleHelp
              className="size-4"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span>Ayuda</span>
          </div>
        </div>
      </div>
    </div>
  );
}
