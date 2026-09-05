import type { HttpTypes } from "@medusajs/types";
import { MobileNavigation } from "@/components/admin/mobile-navigation";

export function AdminHeader({ user }: { user: HttpTypes.AdminUser }) {
  return (
    <header className="sticky top-0 z-20 flex h-[65px] items-center border-b border-border/80 bg-background/92 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <MobileNavigation user={user} />
        <div className="hidden min-w-0 items-center gap-2 text-xs sm:flex">
          <span className="text-muted-foreground">Marketplace</span>
          <span className="text-border">/</span>
          <span className="truncate font-semibold text-foreground">
            Administración
          </span>
        </div>
      </div>
    </header>
  );
}
