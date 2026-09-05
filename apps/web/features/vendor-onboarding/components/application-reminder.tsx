"use client"

import { ClipboardClock, X } from "lucide-react"
import Link from "next/link"
import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ApplicationNavigation } from "../presentation"

const CHANGE_EVENT = "marketplace-application-reminder"
const dismissedInMemory = new Set<string>()

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

export function ApplicationReminder({
  navigation,
  href,
  className,
}: {
  navigation: ApplicationNavigation
  href: string
  className?: string
}) {
  const storageKey = navigation.pendingKey
    ? `marketplace-v2:application-reminder:${navigation.pendingKey}`
    : null
  const dismissed = useSyncExternalStore(
    subscribe,
    () => {
      if (!storageKey) return false
      try {
        return localStorage.getItem(storageKey) === "dismissed"
      } catch {
        return dismissedInMemory.has(storageKey)
      }
    },
    () => false,
  )
  const isPending = Boolean(storageKey) && !dismissed

  function dismiss() {
    if (!storageKey) return
    dismissedInMemory.add(storageKey)
    try {
      localStorage.setItem(storageKey, "dismissed")
    } catch {
      /* Optional local preference. */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
    toast.info(
      "Aviso ocultado. Tu solicitud sigue disponible en el menú de usuario.",
      {
        action: {
          label: "Deshacer",
          onClick: () => {
            dismissedInMemory.delete(storageKey)
            try {
              localStorage.removeItem(storageKey)
            } catch {
              /* In-memory fallback remains usable. */
            }
            window.dispatchEvent(new Event(CHANGE_EVENT))
          },
        },
      },
    )
  }

  if (storageKey && dismissed) return null

  return (
    <div
      className={cn(
        "items-center",
        isPending && "border border-warning/30 bg-warning/10",
        className,
      )}
    >
      <Button
        asChild
        variant="ghost"
        className={cn(
          isPending && "text-warning hover:bg-warning/10 hover:text-warning",
        )}
      >
        <Link href={href}>
          {isPending ? (
            <ClipboardClock className="size-4" aria-hidden="true" />
          ) : null}
          {navigation.label}
        </Link>
      </Button>
      {isPending ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-warning hover:bg-warning/10 hover:text-warning"
          aria-label="Ocultar aviso de solicitud pendiente"
          onClick={dismiss}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
