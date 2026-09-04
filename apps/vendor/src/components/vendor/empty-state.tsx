import type { ComponentType } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type EmptyStateProps = {
  eyebrow?: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  compact?: boolean;
};

export function EmptyState({
  eyebrow = "Vista vacía",
  title,
  description,
  icon: Icon,
  compact = false,
}: EmptyStateProps) {
  return (
    <Card>
      <CardContent className={compact ? "px-6 py-7" : "px-6 py-16 sm:px-12"}>
        <div className="mx-auto flex max-w-lg flex-col items-center text-center">
          <span className="mb-4 grid size-11 place-items-center rounded-xl border border-border bg-secondary text-secondary-foreground">
            <Icon className="size-5" aria-hidden={true} />
          </span>
          <Badge variant="muted">{eyebrow}</Badge>
          <h2 className="mt-3 text-lg font-bold tracking-tight">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {compact ? null : (
            <Button asChild variant="outline" size="sm" className="mt-6">
              <Link href="/seller">Volver al resumen</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
