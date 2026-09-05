import { FetchError } from "@medusajs/js-sdk";
import type {
  AdminApplicationListResponse,
  AdminApplicationResponse,
  ReviewApplicationBody,
  ReviewApplicationResponse,
} from "@marketplace-v2/vendor-onboarding-contracts";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { isApplicationId, type parseApplicationFilters } from "./helpers";
import {
  canCreateProposedCategory,
  createCatalogCategory,
} from "./category-proposal";

export async function listVendorApplications(
  filters: ReturnType<typeof parseApplicationFilters>,
) {
  const sdk = await requireAdminSdk();
  return sdk.client.fetch<AdminApplicationListResponse>(
    "/admin/vendor-applications",
    { query: filters, cache: "no-store" },
  );
}

export async function retrieveVendorApplication(id: string) {
  if (!isApplicationId(id))
    throw new FetchError("Invalid application ID", "Not Found", 404);
  const sdk = await requireAdminSdk();
  return sdk.client.fetch<AdminApplicationResponse>(
    `/admin/vendor-applications/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
}

export async function reviewVendorApplication(
  id: string,
  body: ReviewApplicationBody,
) {
  if (!isApplicationId(id))
    throw new FetchError("Invalid application ID", "Not Found", 404);
  const sdk = await requireAdminSdk();
  return sdk.client.fetch<ReviewApplicationResponse>(
    `/admin/vendor-applications/${encodeURIComponent(id)}/review`,
    { method: "POST", body },
  );
}

export function applicationServiceError(error: unknown) {
  if (error instanceof FetchError) {
    if (error.status === 401)
      return "Tu sesión venció. Vuelve a iniciar sesión para continuar.";
    if (error.status === 403)
      return "No tienes permisos para revisar solicitudes de vendedores.";
    if (error.status === 404)
      return "La solicitud no existe o el servicio de solicitudes aún no está disponible.";
    if (error.status === 409)
      return "La solicitud cambió o hay otra operación en curso. Recarga para revisar su estado antes de volver a decidir.";
    if (error.status === 400)
      return "La decisión no pudo validarse. Revisa los datos de la solicitud y el motivo indicado.";
    if (error.status === 503)
      return "El servicio no está listo para completar esta operación. Revisa su configuración e inténtalo nuevamente.";
  }
  return "No pudimos conectar con el servicio de solicitudes. Inténtalo de nuevo; no asumas que la decisión se guardó.";
}

export async function createProposedCategory(
  id: string,
  input: { name: string; handle: string; version: number },
) {
  if (!isApplicationId(id))
    throw new FetchError("Invalid application ID", "Not Found", 404);
  const sdk = await requireAdminSdk();
  const { application } = await sdk.client.fetch<AdminApplicationResponse>(
    `/admin/vendor-applications/${encodeURIComponent(id)}`,
    { cache: "no-store" },
  );
  if (!canCreateProposedCategory(application, input.version))
    throw new FetchError(
      "Application changed or has no submitted category proposal",
      "Conflict",
      409,
    );
  return createCatalogCategory(sdk.admin.productCategory, {
    name: input.name,
    handle: input.handle,
  });
}
