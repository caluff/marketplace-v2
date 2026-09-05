import type { AdminApplicationListResponse } from "@marketplace-v2/vendor-onboarding-contracts";
import Link from "next/link";
import { ArrowRight, ClipboardCheck, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  APPLICATION_STATUS_LABELS,
  applicationDate,
  applicationListHref,
  type parseApplicationFilters,
} from "../helpers";
import { ApplicationStatusBadge } from "./status-badge";

export function ApplicationList({
  result,
  filters,
}: {
  result: AdminApplicationListResponse;
  filters: ReturnType<typeof parseApplicationFilters>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          Vendedores · Onboarding
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Solicitudes de vendedores
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Revisa solicitudes reales, pide correcciones y habilita tiendas a
          través de Mercur. Aprobar una tienda no publica sus productos ni
          configura cobros.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cola de revisión</CardTitle>
          <CardDescription>
            {result.count} {result.count === 1 ? "solicitud" : "solicitudes"}{" "}
            con los filtros actuales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action="/dashboard/vendor-applications"
            method="get"
            className="mb-6 grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_220px_auto]"
          >
            <Field>
              <FieldLabel htmlFor="application-search">
                Buscar solicitante o tienda
              </FieldLabel>
              <Input
                id="application-search"
                name="q"
                maxLength={100}
                defaultValue={filters.q}
                placeholder="Nombre o correo"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="application-status">Estado</FieldLabel>
              <NativeSelect
                id="application-status"
                name="status"
                defaultValue={filters.status}
              >
                {Object.entries(APPLICATION_STATUS_LABELS).map(
                  ([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ),
                )}
              </NativeSelect>
            </Field>
            <Button type="submit" variant="outline">
              <Search className="size-4" aria-hidden="true" />
              Filtrar
            </Button>
          </form>
          {result.applications.length ? (
            <Table>
              <TableCaption className="sr-only">
                Solicitudes de vendedores. Fechas en UTC.
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Tienda / solicitante</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Enviada (UTC)</TableHead>
                  <TableHead>
                    <span className="sr-only">Abrir solicitud</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.applications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell>
                      <p className="font-semibold">
                        {application.store_name || "Tienda sin nombre"}
                      </p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {application.customer.email}
                      </p>
                    </TableCell>
                    <TableCell>
                      {application.business_type === "company"
                        ? "Empresa"
                        : "Individual"}
                    </TableCell>
                    <TableCell>
                      <ApplicationStatusBadge status={application.status} />
                      {application.approval_state === "processing" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Habilitando tienda…
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {applicationDate(application.submitted_at)}
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/dashboard/vendor-applications/${encodeURIComponent(application.id)}`}
                          aria-label={`Revisar ${application.store_name || application.customer.email}`}
                        >
                          Revisar
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center gap-3 border border-dashed border-border px-6 py-12 text-center">
              <ClipboardCheck
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="font-semibold">
                No hay solicitudes con estos filtros
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Cuando un comprador envíe su solicitud, aparecerá en «En
                revisión». No se muestran registros de demostración.
              </p>
            </div>
          )}
          <nav
            aria-label="Páginas de solicitudes"
            className="mt-5 flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-xs text-muted-foreground">
              {result.applications.length
                ? `${result.offset + 1}–${result.offset + result.applications.length} de ${result.count}`
                : `0 de ${result.count}`}
            </p>
            <div className="flex gap-2">
              {result.offset > 0 && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={applicationListHref(
                      filters,
                      result.offset - result.limit,
                    )}
                  >
                    Anterior
                  </Link>
                </Button>
              )}
              {result.offset + result.limit < result.count && (
                <Button asChild variant="outline" size="sm">
                  <Link
                    href={applicationListHref(
                      filters,
                      result.offset + result.limit,
                    )}
                  >
                    Siguiente
                  </Link>
                </Button>
              )}
            </div>
          </nav>
        </CardContent>
      </Card>
    </div>
  );
}
