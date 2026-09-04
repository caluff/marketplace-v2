import { ArrowUpRight, CircleDashed } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "neutral";
};

export function MetricCard({ label, value, detail, tone }: MetricCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <p className="max-w-[12rem] text-sm font-medium leading-5 text-muted-foreground">
            {label}
          </p>
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-lg",
              tone === "success" && "bg-success/10 text-success-foreground",
              tone === "warning" && "bg-warning/12 text-warning-foreground",
              tone === "neutral" && "bg-muted text-muted-foreground",
            )}
          >
            {tone === "success" ? (
              <ArrowUpRight className="size-4" aria-hidden="true" />
            ) : (
              <CircleDashed className="size-4" aria-hidden="true" />
            )}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="font-mono text-3xl font-semibold leading-none tracking-[-0.06em]">
            {value}
          </p>
          <Badge variant="outline" className="mb-0.5 text-[9px] uppercase">
            Demo
          </Badge>
        </div>
        <p className="mt-3 text-xs leading-4 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
