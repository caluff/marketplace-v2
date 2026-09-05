import type {
  ApplicationResponse,
  ApplicationStatus,
} from "@marketplace-v2/vendor-onboarding-contracts"

export const APPLICATION_PATH = "/account/sell"
export const APPLICATION_LOGIN_PATH = "/login?next=%2Faccount%2Fsell"

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Borrador",
  submitted: "En revisión",
  changes_requested: "Necesita correcciones",
  approved: "Solicitud aprobada",
  rejected: "Solicitud rechazada",
}

export type ApplicationNavigation = {
  label: string
  unreadCount: number
  pendingKey?: string
}

export function applicationNavigation(
  response: ApplicationResponse | null,
): ApplicationNavigation {
  const application = response?.application
  return {
    label:
      response?.applicant.existing_vendor_access ||
      application?.status === "approved"
        ? "Mi tienda"
        : application?.status === "draft"
          ? "Continuar solicitud"
          : application?.status === "changes_requested"
            ? "Corregir solicitud"
            : application
              ? "Ver solicitud"
              : "Vender en Marketplace V2",
    unreadCount: response?.unread_count ?? 0,
    ...(application &&
    !response?.applicant.existing_vendor_access &&
    (application.status === "draft" ||
      application.status === "changes_requested")
      ? {
          pendingKey: `${application.id}:${application.status}:${application.submission_revision}`,
        }
      : {}),
  }
}

export function vendorLoginUrl(origin: string | undefined): string | null {
  if (!origin) return null
  try {
    const url = new URL(origin)
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null
    return new URL("/seller/login?next=%2Fseller", url.origin).toString()
  } catch {
    return null
  }
}
