import { Clock3, Package } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { demoReviewQueue } from "@/lib/demo-data";

function getStatusVariant(status: (typeof demoReviewQueue)[number]["status"]) {
  if (status === "Prioritario") return "warning" as const;
  if (status === "En revisión") return "success" as const;
  return "neutral" as const;
}

export function ReviewQueueTable() {
  return (
    <Table aria-label="Cola de solicitudes de demostración">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Solicitud</TableHead>
          <TableHead className="hidden md:table-cell">Enviada por</TableHead>
          <TableHead className="hidden lg:table-cell">Tipo</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Espera</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {demoReviewQueue.map((request) => (
          <TableRow key={request.id}>
            <TableCell>
              <div className="flex min-w-[13rem] items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted/65 text-muted-foreground">
                  <Package
                    className="size-4"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {request.item}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {request.id}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell className="hidden text-muted-foreground md:table-cell">
              {request.submittedBy}
            </TableCell>
            <TableCell className="hidden text-muted-foreground lg:table-cell">
              {request.kind}
            </TableCell>
            <TableCell>
              <Badge variant={getStatusVariant(request.status)}>
                {request.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Clock3 className="size-3.5" aria-hidden="true" />
                {request.age}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
