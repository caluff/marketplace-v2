import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: "positive" | "attention" | "neutral";
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

const toneVariant = {
  positive: "success",
  attention: "warning",
  neutral: "muted",
} as const;

export function MetricCard({
  label,
  value,
  detail,
  tone,
  icon: Icon,
}: MetricCardProps) {
  return (
    <Card className="group overflow-hidden transition-transform duration-200 hover:-translate-y-0.5">
      <CardHeader className="flex-row items-center justify-between pb-3">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        <span className="grid size-9 place-items-center rounded-lg bg-secondary text-secondary-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="size-4" aria-hidden={true} />
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-mono text-3xl font-semibold tracking-tight">
          {value}
        </p>
        <Badge variant={toneVariant[tone]}>{detail}</Badge>
      </CardContent>
    </Card>
  );
}
