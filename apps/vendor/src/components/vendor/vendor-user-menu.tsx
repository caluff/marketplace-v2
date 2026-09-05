"use client";

import { useRef } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Repeat2,
  Sun,
} from "lucide-react";
import { logoutVendorAction } from "@/app/seller/auth-actions";
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

export function VendorUserMenu({
  memberName,
  memberEmail,
  sellerName,
  roleLabel,
  canSwitchSeller,
}: {
  memberName: string;
  memberEmail: string;
  sellerName: string;
  roleLabel: string;
  canSwitchSeller: boolean;
}) {
  const { theme, setTheme } = useTheme();
  const formRef = useRef<HTMLFormElement>(null);
  const initials =
    memberName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "MV";
  return (
    <div className="shrink-0 border-t border-sidebar-border p-3">
      <form ref={formRef} action={logoutVendorAction} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full justify-start gap-3 px-2 py-2 text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label={`Menú del usuario: ${memberName}`}
          >
            <Avatar className="size-9">
              <AvatarFallback className="bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-semibold">
                {sellerName}
              </span>
              <span className="block truncate text-xs font-normal text-sidebar-foreground/55">
                {memberName}
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-60 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuLabel>
            <span className="block truncate">{memberName}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {memberEmail}
            </span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              {roleLabel}
            </span>
          </DropdownMenuLabel>
          {canSwitchSeller ? (
            <DropdownMenuItem asChild>
              <Link href="/seller/select-seller">
                <Repeat2 aria-hidden="true" />
                Cambiar tienda
              </Link>
            </DropdownMenuItem>
          ) : null}
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
