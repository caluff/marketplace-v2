import { Slot } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"
import type * as React from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 border px-2.5 py-1 font-sans text-[0.68rem] font-bold tracking-[0.12em] uppercase [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground",
        accent:
          "border-brand-accent bg-brand-accent text-brand-accent-foreground",
        outline: "border-border bg-background text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "span"

  return (
    <Component
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
