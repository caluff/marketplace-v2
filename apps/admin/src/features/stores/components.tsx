import { TablePagination } from "@/components/table-pagination";
import type { SellerDTO } from "@mercurjs/types";
import type { CatalogPermissionListResponse } from "@marketplace-v2/api/catalog-permission-contracts";
import { Suspense } from "react";
import { FetchError } from "@medusajs/js-sdk";
import { Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { AdminAutoRefresh } from "@/features/realtime/auto-refresh";
import { cn } from "@/lib/utils";
import { CatalogPermissionForm } from "./catalog-permission-form";
import { listCatalogPermissions, listStores, retrieveStore } from "./data";
import {
  isStoreId,
  parseStoreFilters,
  STORE_STATUS_LABELS,
  catalogReviewMode,
  storeListHref,
  storeStatusLabel,
} from "./helpers";

type CatalogPermissionRead = Promise<CatalogPermissionListResponse | null>;

async function CatalogPermissionRegion({
  seller,
  permissions,
  href,
}: {
  seller: Pick<SellerDTO, "id" | "name">;
  permissions: CatalogPermissionRead;
  href: string;
}) {
  const result = await permissions;
  const matches =
    result && Array.isArray(result.catalog_permissions)
      ? result.catalog_permissions.filter(
          (permission) => permission?.seller_id === seller.id,
        )
      : null;
  const mode =
    matches && matches.length <= 1 ? catalogReviewMode(matches[0]) : null;
  if (!mode)
    return (
      <div role="alert" className="min-w-64 space-y-2">
        <p className="text-xs text-destructive">Permiso no disponible.</p>
        <Button asChild variant="outline" size="sm">
          <a href={href}>Actualizar estado</a>
        </Button>
      </div>
    );

  return (
    <CatalogPermissionForm
      key={seller.id}
      sellerId={seller.id}
      sellerName={seller.name}
      mode={mode}
    />
  );
}

function CatalogPermissionSkeleton() {
  return (
    <Skeleton
      aria-label="Cargando permiso de catálogo"
      className="h-9 w-full min-w-48"
    />
  );
}

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
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <nav
        aria-label="Estados de tiendas"
        className="flex min-w-0 max-w-full self-start gap-1 overflow-x-auto border-b md:self-auto"
      >
        {Object.entries({ all: "Todas", ...STORE_STATUS_LABELS }).map(
          ([value, label]) => (
            <Link
              key={value}
              href={storeListHref(
                { ...filters, status: value as typeof filters.status },
                0,
              )}
              aria-current={filters.status === value ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                filters.status === value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ),
        )}
      </nav>
      <form
        action="/dashboard/stores"
        method="get"
        role="search"
        className="relative mb-3 w-full shrink-0 md:mb-0 md:w-52 lg:w-64"
      >
        <label className="sr-only" htmlFor="store-search">
          Buscar tienda
        </label>
        <Input
          key={filters.q}
          id="store-search"
          name="q"
          maxLength={100}
          defaultValue={filters.q}
          placeholder="Nombre, email o identificador"
          className="pr-12"
        />
        <input type="hidden" name="status" value={filters.status} />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          aria-label="Buscar tiendas"
          className="absolute right-1 top-1 size-8"
        >
          <Search aria-hidden="true" strokeWidth={1.5} />
        </Button>
      </form>
    </div>
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
    return (
      <AdminAutoRefresh eventName="stores-changed">
        <StoreReadError href={storeListHref(filters, filters.offset)} />
      </AdminAutoRefresh>
    );
  }
  const permissions = result.sellers.length
    ? listCatalogPermissions(
        sdk,
        result.sellers.map((seller) => seller.id),
      ).catch(() => null)
    : Promise.resolve({ catalog_permissions: [] });
  return (
    <AdminAutoRefresh eventName="stores-changed">
      <div>
        {result.sellers.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tienda</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Permiso de catálogo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.sellers.map((seller) => (
                <TableRow key={seller.id} className="relative">
                  <TableCell>
                    <Link
                      href={`/dashboard/stores/${encodeURIComponent(seller.id)}`}
                      aria-label={`Ver ${seller.name}`}
                      className="font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                    >
                      {seller.name}
                    </Link>
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
                    <div className="relative z-10">
                      <Suspense fallback={<CatalogPermissionSkeleton />}>
                        <CatalogPermissionRegion
                          seller={seller}
                          permissions={permissions}
                          href={storeListHref(filters, filters.offset)}
                        />
                      </Suspense>
                    </div>
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
        <TablePagination
          label="Páginas de tiendas"
          count={result.count}
          offset={result.offset}
          limit={result.limit}
          itemCount={result.sellers.length}
          hrefForOffset={(offset) => storeListHref(filters, offset)}
        />
      </div>
    </AdminAutoRefresh>
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

function StoreDetails({
  seller,
  permissions,
}: {
  seller: SellerDTO;
  permissions: CatalogPermissionRead;
}) {
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
          <div className="mt-6 max-w-md space-y-2 border-t border-border pt-5">
            <p className="text-sm font-medium">Permiso de catálogo</p>
            <Suspense fallback={<CatalogPermissionSkeleton />}>
              <CatalogPermissionRegion
                seller={seller}
                permissions={permissions}
                href={`/dashboard/stores/${encodeURIComponent(seller.id)}`}
              />
            </Suspense>
            <p className="text-xs text-muted-foreground">
              Supervisado requiere revisión del administrador. Autorizado
              permite añadir y editar productos sin aprobación.
            </p>
          </div>
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
                <DetailField label="Estado" value={address.province} />
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
  const permissions = listCatalogPermissions(sdk, [id]).catch(() => null);
  let result;
  try {
    result = await retrieveStore(sdk, id);
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) notFound();
    return (
      <StoreReadError href={`/dashboard/stores/${encodeURIComponent(id)}`} />
    );
  }
  return <StoreDetails seller={result.seller} permissions={permissions} />;
}
