import type { SellerDTO } from "@mercurjs/types";
import { FetchError } from "@medusajs/js-sdk";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { listStores, retrieveStore } from "./data";
import {
  isStoreId,
  parseStoreFilters,
  STORE_STATUS_LABELS,
  storeListHref,
  storeStatusLabel,
} from "./helpers";

export function StoreRegionSkeleton() {
  return (
    <div aria-label="Cargando tiendas" className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function StoreReadError({ href }: { href: string }) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-border p-6">
      <p className="text-sm text-muted-foreground">
        No pudimos cargar los datos de tiendas. Inténtalo nuevamente.
      </p>
      <Button asChild variant="outline" size="sm">
        <a href={href}>Reintentar</a>
      </Button>
    </div>
  );
}

export function StoreFilters({
  filters,
}: {
  filters: ReturnType<typeof parseStoreFilters>;
}) {
  return (
    <form
      action="/dashboard/stores"
      className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_240px_auto]"
    >
      <Field>
        <FieldLabel htmlFor="store-search">Buscar tienda</FieldLabel>
        <Input
          id="store-search"
          name="q"
          maxLength={100}
          defaultValue={filters.q}
          placeholder="Nombre, email o identificador"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="store-status">Estado</FieldLabel>
        <NativeSelect
          id="store-status"
          name="status"
          defaultValue={filters.status}
        >
          <NativeSelectOption value="all">Todos los estados</NativeSelectOption>
          {Object.entries(STORE_STATUS_LABELS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Button variant="outline" type="submit">
        Filtrar
      </Button>
    </form>
  );
}

export async function StoreResults({
  filters,
}: {
  filters: ReturnType<typeof parseStoreFilters>;
}) {
  const sdk = await requireAdminSdk();
  let result;
  try {
    result = await listStores(sdk, filters);
  } catch {
    return <StoreReadError href={storeListHref(filters, filters.offset)} />;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Directorio de tiendas</CardTitle>
      </CardHeader>
      <CardContent>
        {result.sellers.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tienda</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.sellers.map((seller) => (
                <TableRow key={seller.id}>
                  <TableCell>
                    <p className="font-semibold">{seller.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {seller.handle}
                    </p>
                  </TableCell>
                  <TableCell>{seller.email || "Sin email"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={seller.status === "open" ? "success" : "neutral"}
                    >
                      {storeStatusLabel(seller.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="uppercase">
                    {seller.currency_code}
                  </TableCell>
                  <TableCell>
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href={`/dashboard/stores/${encodeURIComponent(seller.id)}`}
                        aria-label={`Ver ${seller.name}`}
                      >
                        Ver tienda
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            No hay tiendas con estos filtros.
          </p>
        )}
        <nav
          aria-label="Páginas de tiendas"
          className="mt-5 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-xs text-muted-foreground">
            {result.sellers.length
              ? `${result.offset + 1}–${result.offset + result.sellers.length} de ${result.count}`
              : `0 de ${result.count}`}
          </p>
          <div className="flex gap-2">
            {result.offset > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={storeListHref(filters, result.offset - result.limit)}
                >
                  Anterior
                </Link>
              </Button>
            )}
            {result.offset + result.limit < result.count && (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={storeListHref(filters, result.offset + result.limit)}
                >
                  Siguiente
                </Link>
              </Button>
            )}
          </div>
        </nav>
      </CardContent>
    </Card>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm">{value || "Sin informar"}</dd>
    </div>
  );
}

function StoreDetails({ seller }: { seller: SellerDTO }) {
  const address = seller.address;
  const business = seller.professional_details;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{seller.name}</CardTitle>
            <Badge variant={seller.status === "open" ? "success" : "neutral"}>
              {storeStatusLabel(seller.status)}
            </Badge>
            {seller.is_premium && <Badge variant="secondary">Destacada</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-5 sm:grid-cols-2">
            <DetailField label="Identificador" value={seller.id} />
            <DetailField label="Handle" value={seller.handle} />
            <DetailField label="Email" value={seller.email} />
            <DetailField label="Teléfono" value={seller.phone} />
            <DetailField label="Sitio web" value={seller.website_url} />
            <DetailField
              label="Moneda"
              value={seller.currency_code.toUpperCase()}
            />
            <DetailField label="Descripción" value={seller.description} />
            <DetailField
              label="Motivo del estado"
              value={seller.status_reason}
            />
          </dl>
        </CardContent>
      </Card>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos de la empresa</CardTitle>
          </CardHeader>
          <CardContent>
            {business ? (
              <dl className="space-y-5">
                <DetailField
                  label="Razón social"
                  value={business.corporate_name}
                />
                <DetailField
                  label="Número de registro"
                  value={business.registration_number}
                />
                <DetailField
                  label="Identificación fiscal"
                  value={business.tax_id}
                />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                La tienda no tiene datos de empresa registrados.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dirección registrada</CardTitle>
          </CardHeader>
          <CardContent>
            {address ? (
              <dl className="grid gap-5 sm:grid-cols-2">
                <DetailField label="Nombre" value={address.name} />
                <DetailField
                  label="Contacto"
                  value={[address.first_name, address.last_name]
                    .filter(Boolean)
                    .join(" ")}
                />
                <DetailField
                  label="Dirección"
                  value={[address.address_1, address.address_2]
                    .filter(Boolean)
                    .join(", ")}
                />
                <DetailField label="Ciudad" value={address.city} />
                <DetailField label="Provincia" value={address.province} />
                <DetailField
                  label="Código postal"
                  value={address.postal_code}
                />
                <DetailField
                  label="País"
                  value={address.country_code?.toUpperCase()}
                />
                <DetailField label="Teléfono" value={address.phone} />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                La tienda no tiene una dirección registrada.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export async function StoreDetailRegion({ id }: { id: string }) {
  if (!isStoreId(id)) notFound();
  const sdk = await requireAdminSdk();
  let result;
  try {
    result = await retrieveStore(sdk, id);
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) notFound();
    return (
      <StoreReadError href={`/dashboard/stores/${encodeURIComponent(id)}`} />
    );
  }
  return <StoreDetails seller={result.seller} />;
}
