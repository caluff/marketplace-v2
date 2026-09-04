"use client"

import * as React from "react"
import { Laptop, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const subscribe = () => () => {}

export function ModeToggle({ className }: { className?: string }) {
  const mounted = React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  const { setTheme, theme } = useTheme()
  const selectedTheme = mounted ? (theme ?? "system") : "system"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={!mounted}
          className={cn("relative", className)}
          aria-label="Cambiar apariencia"
          title="Cambiar apariencia"
        >
          <Sun
            className="size-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0"
            aria-hidden="true"
          />
          <Moon
            className="absolute size-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100"
            aria-hidden="true"
          />
          <span className="sr-only">Cambiar apariencia</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Apariencia</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selectedTheme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden="true" />
            Claro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden="true" />
            Oscuro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Laptop aria-hidden="true" />
            Sistema
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
