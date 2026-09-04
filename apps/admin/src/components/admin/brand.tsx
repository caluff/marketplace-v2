import Link from "next/link";
import { Boxes } from "lucide-react";

import { cn } from "@/lib/utils";

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/dashboard"
      data-testid="admin-brand-link"
      className={cn(
        "group flex w-fit items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className,
      )}
    >
      <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm transition-transform group-hover:-rotate-2">
        <Boxes className="size-[18px]" aria-hidden="true" />
      </span>
      {compact ? null : (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-[-0.02em]">
            Marketplace
          </span>
          <span className="block text-[11px] font-medium text-sidebar-muted">
            Control de operaciones
          </span>
        </span>
      )}
    </Link>
  );
}
