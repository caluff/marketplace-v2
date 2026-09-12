import type { HttpTypes } from "@medusajs/types";

import { Brand } from "@/components/admin/brand";
import { NavigationContent } from "@/components/admin/navigation";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function AdminSidebar({ user }: { user: HttpTypes.AdminUser }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-[65px] justify-center border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <Brand />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavigationContent />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <AdminUserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
