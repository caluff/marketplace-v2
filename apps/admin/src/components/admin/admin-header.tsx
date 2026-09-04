import { Bell, Search } from "lucide-react";

import { MobileNavigation } from "@/components/admin/mobile-navigation";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminHeader() {
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
        <div className="relative hidden w-56 md:block" role="search">
          <Search
            className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            disabled
            data-testid="admin-search-disabled"
            aria-label="Búsqueda todavía no disponible"
            placeholder="Búsqueda próximamente"
            className="h-8 bg-card pl-8 text-xs"
          />
        </div>
        <ModeToggle />
        <Button
          variant="ghost"
          size="icon"
          disabled
          data-testid="admin-notifications-disabled"
          aria-label="Notificaciones todavía no disponibles"
          className="size-8"
        >
          <Bell className="size-4" aria-hidden="true" />
        </Button>
        <div className="ml-1 grid size-8 place-items-center rounded-full border border-border bg-card text-[11px] font-semibold shadow-xs">
          OP
        </div>
      </div>
    </header>
  );
}
