"use client";

import { PanelLeft } from "lucide-react";
import type { HttpTypes } from "@medusajs/types";
import { AdminUserMenu } from "@/components/admin/admin-user-menu";

import { Brand } from "@/components/admin/brand";
import { NavigationContent } from "@/components/admin/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function MobileNavigation({ user }: { user: HttpTypes.AdminUser }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 lg:hidden"
          data-testid="mobile-navigation-open"
          aria-label="Abrir navegación"
        >
          <PanelLeft className="size-[18px]" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle className="sr-only">
          Navegación del administrador
        </SheetTitle>
        <SheetDescription className="sr-only">
          Accesos a las áreas disponibles y previstas del panel.
        </SheetDescription>
        <div className="flex h-[65px] items-center border-b border-sidebar-border px-5">
          <Brand />
        </div>
        <NavigationContent mobile />
        <AdminUserMenu user={user} />
      </SheetContent>
    </Sheet>
  );
}
