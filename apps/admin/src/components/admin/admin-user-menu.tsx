"use client";

import type { HttpTypes } from "@medusajs/types";
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRef } from "react";
import { logoutAdminAction } from "@/app/auth-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function AdminUserMenu({ user }: { user: HttpTypes.AdminUser }) {
  const { theme, setTheme } = useTheme();
  const formRef = useRef<HTMLFormElement>(null);
  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") || "Operador";
  const initials =
    `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}` ||
    user.email[0]?.toUpperCase() ||
    "OP";
  return (
    <div className="shrink-0 border-t border-sidebar-border px-3 py-3">
      <form ref={formRef} action={logoutAdminAction} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full justify-start gap-3 px-2 py-2 text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label={`Menú del usuario: ${name}`}
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-sidebar-accent text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-xs font-semibold">
                {name}
              </span>
              <span className="block truncate text-[11px] font-normal text-sidebar-muted">
                {user.email}
              </span>
            </span>
            <ChevronsUpDown
              className="size-4 shrink-0 text-sidebar-muted"
              aria-hidden="true"
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-60 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuLabel className="truncate">
            {name}
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Apariencia
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">
              <Sun aria-hidden="true" />
              Claro
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon aria-hidden="true" />
              Oscuro
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor aria-hidden="true" />
              Sistema
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => formRef.current?.requestSubmit()}
          >
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
