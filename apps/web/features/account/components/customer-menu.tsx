"use client"

import type { HttpTypes } from "@medusajs/types"
import {
  Heart,
  LoaderCircle,
  LogOut,
  MapPin,
  Package,
  UserRound,
} from "lucide-react"
import Link from "next/link"
import { useActionState, useRef } from "react"

import { logoutCustomerAction } from "@/app/auth-actions"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { getCustomerIdentity } from "@/features/account/customer-identity"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const links = [
  { href: "/account", label: "Mi cuenta", icon: UserRound },
  { href: "/account/orders", label: "Mis órdenes", icon: Package },
  { href: "/account/addresses", label: "Mis direcciones", icon: MapPin },
  { href: "/account/favorites", label: "Favoritos", icon: Heart },
]

export function CustomerMenu({
  first_name,
  last_name,
  email,
}: Pick<HttpTypes.StoreCustomer, "first_name" | "last_name" | "email">) {
  const formRef = useRef<HTMLFormElement>(null)
  const [, action, pending] = useActionState(logoutCustomerAction, undefined)
  const { name, initials } = getCustomerIdentity({
    first_name,
    last_name,
    email,
  })

  return (
    <form ref={formRef} action={action} aria-busy={pending}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Abrir menú de usuario"
            disabled={pending}
          >
            <Avatar className="size-9 border border-border">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-64 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuLabel className="px-3 py-3">
            <span className="block truncate font-semibold">{name}</span>
            <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
              {email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {links.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem
                key={href}
                asChild
                disabled={pending}
                className="min-h-11 gap-3 px-3"
              >
                <Link href={href}>
                  <Icon aria-hidden="true" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={pending}
            className="min-h-11 gap-3 px-3"
            onSelect={(event) => {
              event.preventDefault()
              formRef.current?.requestSubmit()
            }}
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <LogOut aria-hidden="true" />
            )}
            {pending ? "Cerrando sesión…" : "Cerrar sesión"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </form>
  )
}
