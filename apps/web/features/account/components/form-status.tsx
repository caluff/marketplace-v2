import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { AccountActionState } from "@/features/account/types"
import { cn } from "@/lib/utils"

export function FormStatus({ state }: { state: AccountActionState }) {
  const Icon = state.status === "error" ? CircleAlert : CircleCheck

  return (
    <div aria-live="polite" aria-atomic="true">
      {state.message ? (
        <p
          className={cn(
            "flex items-start gap-3 border border-border bg-muted/50 p-4 text-sm leading-6",
            state.status === "error" &&
              "border-destructive/30 text-destructive",
          )}
        >
          <Icon className="mt-1 size-4 shrink-0" aria-hidden="true" />
          <span>{state.message}</span>
        </p>
      ) : null}
    </div>
  )
}

export function AccountSubmitButton({
  pending,
  children,
}: {
  pending: boolean
  children: string
}) {
  return (
    <Button
      type="submit"
      variant="accent"
      disabled={pending}
      className="min-h-12 w-full sm:w-auto"
    >
      {pending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : null}
      {pending ? "Guardando…" : children}
    </Button>
  )
}
