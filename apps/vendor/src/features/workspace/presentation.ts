import { intlFormat } from "date-fns/intlFormat";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";

export const PAGE_SIZE = 20;

export function listInput(params: { q?: string; page?: string }) {
  const parsed = Number(params.page ?? 1);
  const page =
    Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 50000 ? parsed : 1;
  return {
    q: (params.q ?? "").trim().slice(0, 200),
    page,
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  };
}

export function formatMoney(value: unknown, currency: string) {
  const amount =
    typeof value === "number" || (typeof value === "string" && value.trim())
      ? Number(value)
      : NaN;
  if (!Number.isFinite(amount)) return "No disponible";
  try {
    return new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("es-UY")} ${currency}`;
  }
}

export function formatDate(value: Date | string | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (!isValid(date)) return "—";
  return intlFormat(
    date,
    { dateStyle: "medium", timeZone: "America/Montevideo" },
    { locale: "es-UY" },
  );
}

const statuses: Record<string, string> = {
  draft: "Borrador",
  proposed: "Pendiente de aprobación",
  published: "Publicado",
  rejected: "Rechazado",
  requires_action: "Requiere cambios",
  pending: "Pendiente",
  completed: "Completado",
  canceled: "Cancelado",
  archived: "Archivado",
  confirmed: "Aprobado",
  declined: "Rechazado",
  not_fulfilled: "Sin preparar",
  partially_fulfilled: "Preparación parcial",
  fulfilled: "Preparado",
  partially_shipped: "Envío parcial",
  shipped: "Enviado",
  partially_delivered: "Entrega parcial",
  delivered: "Entregado",
  open: "Activa",
  pending_approval: "Pendiente de aprobación",
  suspended: "Suspendida",
  terminated: "Finalizada",
};
export function statusLabel(value: string | undefined) {
  return value ? (statuses[value] ?? value) : "No disponible";
}

export type MutationState = {
  status: "idle" | "success" | "error";
  message?: string;
  href?: string;
};
