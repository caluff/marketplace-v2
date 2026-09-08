import type { Metadata } from "next";
import type { HttpTypes } from "@mercurjs/types";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DataError,
  PageHeading,
  StatusBadge,
} from "@/features/workspace/components";
import { MutationForm } from "@/features/workspace/mutation-form";
import {
  updateAddressAction,
  updateCompanyAction,
  updateProfileAction,
} from "@/features/workspace/actions";
import { resultOf, workspace } from "@/features/workspace/data";

export const metadata: Metadata = { title: "Ajustes" };
type SettingsSection = "profile" | "address" | "company";
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const params = await searchParams;
  const section: SettingsSection =
    params.section === "address" || params.section === "company"
      ? params.section
      : "profile";
  const title =
    section === "address"
      ? "Dirección comercial"
      : section === "company"
        ? "Información de la empresa"
        : "Perfil público";
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeading eyebrow="Ajustes" title={title} />
      <Suspense
        key={section}
        fallback={
          <Skeleton
            className="h-96 w-full"
            aria-label="Cargando información de la tienda"
          />
        }
      >
        <SellerSettingsContent section={section} />
      </Suspense>
    </div>
  );
}

async function SellerSettingsContent({
  section,
}: {
  section: SettingsSection;
}) {
  const { client } = await workspace();
  const result = await resultOf(
    client.get<HttpTypes.VendorSellerResponse>("/vendor/sellers/me", {
      fields:
        "id,name,email,phone,description,website_url,status,currency_code,address.*,professional_details.*",
    }),
  );
  if (!result.data) return <DataError message={result.error} />;
  const { seller } = result.data;
  const address = seller.address;
  const company = seller.professional_details;
  return (
    <div className="max-w-4xl space-y-6">
      {section === "profile" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Moneda de la tienda: {seller.currency_code.toUpperCase()}. El
            operador administra el estado de acceso.
          </p>
          <StatusBadge status={seller.status} />
        </div>
      ) : null}
      {section === "profile" ? (
        <Card>
          <CardHeader>
            <CardTitle>Perfil público</CardTitle>
          </CardHeader>
          <CardContent>
            <MutationForm
              action={updateProfileAction}
              submit="Guardar perfil"
              fields={[
                {
                  name: "name",
                  label: "Nombre de la tienda",
                  value: seller.name,
                  required: true,
                  maxLength: 200,
                },
                {
                  name: "email",
                  label: "Correo de la tienda",
                  type: "email",
                  value: seller.email,
                  required: true,
                  maxLength: 254,
                },
                {
                  name: "phone",
                  label: "Teléfono",
                  value: seller.phone ?? "",
                  maxLength: 50,
                },
                {
                  name: "website_url",
                  label: "Sitio web",
                  type: "url",
                  value: seller.website_url ?? "",
                },
                {
                  name: "description",
                  label: "Descripción",
                  type: "textarea",
                  value: seller.description ?? "",
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
      {section === "address" ? (
        <Card>
          <CardHeader>
            <CardTitle>Dirección comercial</CardTitle>
            <p className="text-sm text-muted-foreground">
              País: Estados Unidos
            </p>
          </CardHeader>
          <CardContent>
            <MutationForm
              action={updateAddressAction}
              submit="Guardar dirección"
              hidden={{ country_code: "us" }}
              fields={[
                {
                  name: "company",
                  label: "Empresa",
                  value: address?.company ?? "",
                },
                {
                  name: "address_1",
                  label: "Dirección",
                  value: address?.address_1 ?? "",
                  required: true,
                },
                {
                  name: "address_2",
                  label: "Apartamento / complemento",
                  value: address?.address_2 ?? "",
                },
                {
                  name: "city",
                  label: "Ciudad",
                  value: address?.city ?? "",
                  required: true,
                },
                {
                  name: "province",
                  label: "Departamento / provincia",
                  value: address?.province ?? "",
                },
                {
                  name: "postal_code",
                  label: "Código postal",
                  value: address?.postal_code ?? "",
                  required: true,
                  maxLength: 30,
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
      {section === "company" ? (
        <Card>
          <CardHeader>
            <CardTitle>Información de la empresa</CardTitle>
          </CardHeader>
          <CardContent>
            <MutationForm
              action={updateCompanyAction}
              submit="Guardar empresa"
              fields={[
                {
                  name: "corporate_name",
                  label: "Razón social",
                  value: company?.corporate_name ?? "",
                  required: true,
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
