import type { HttpTypes } from "@medusajs/types";
import { LogOut } from "lucide-react";

import { logoutAdminAction } from "@/app/auth-actions";
import { MobileNavigation } from "@/components/admin/mobile-navigation";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";

export function AdminHeader({ user }: { user: HttpTypes.AdminUser }) {
  const initials = `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}` || user.email[0]?.toUpperCase() || "OP";
  return (
    <header className="sticky top-0 z-20 flex h-[65px] items-center border-b border-border/80 bg-background/92 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <MobileNavigation />
        <div className="hidden min-w-0 items-center gap-2 text-xs sm:flex">
          <span className="text-muted-foreground">Marketplace</span>
          <span className="text-border">/</span>
          <span className="truncate font-semibold text-foreground">
            Resumen
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ModeToggle />
        <span className="hidden max-w-48 truncate text-xs font-medium text-muted-foreground sm:block">
          {user.email}
        </span>
        <div className="ml-1 grid size-9 place-items-center rounded-full border border-border bg-card text-[11px] font-semibold shadow-xs" aria-label={`Operador ${user.email}`}>
          {initials}
        </div>
        <form action={logoutAdminAction}>
          <Button type="submit" variant="ghost" size="icon" className="size-11" aria-label="Cerrar sesión">
            <LogOut className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </div>
    </header>
  );
}
