import type { HttpTypes } from "@medusajs/types";

import { Brand } from "@/components/admin/brand";
import { NavigationContent } from "@/components/admin/navigation";

export function AdminSidebar({ user }: { user: HttpTypes.AdminUser }) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Operador";
  const initials = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}` || user.email[0]?.toUpperCase() || "OP";
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-[65px] items-center border-b border-sidebar-border px-5">
        <Brand />
      </div>
      <NavigationContent />
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3 rounded-lg px-1.5 py-1">
          <span className="grid size-8 place-items-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-foreground">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">
              {name}
            </span>
            <span className="block truncate text-[11px] text-sidebar-muted">
              {user.email}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}
