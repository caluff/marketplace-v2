import type { HttpTypes } from "@medusajs/types";

import { Brand } from "@/components/admin/brand";
import { NavigationContent } from "@/components/admin/navigation";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";

export function AdminSidebar({ user }: { user: HttpTypes.AdminUser }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex h-[65px] items-center border-b border-sidebar-border px-5">
        <Brand />
      </div>
      <NavigationContent />
      <AdminUserMenu user={user} />
    </aside>
  );
}
