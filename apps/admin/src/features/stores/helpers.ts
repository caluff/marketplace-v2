export const STORE_STATUS_LABELS = {
  open: "Activa",
  pending_approval: "Pendiente de aprobación",
  suspended: "Suspendida",
  terminated: "Cerrada",
};

export function parseStoreFilters(
  params: Record<string, string | string[] | undefined>,
) {
  const offset = typeof params.offset === "string" ? Number(params.offset) : 0;
  return {
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : "",
    status:
      typeof params.status === "string" &&
      Object.hasOwn(STORE_STATUS_LABELS, params.status)
        ? (params.status as keyof typeof STORE_STATUS_LABELS)
        : ("all" as const),
    offset:
      Number.isSafeInteger(offset) && offset >= 0
        ? Math.min(offset, 1_000_000)
        : 0,
    limit: 20,
  };
}

export function storeListHref(
  filters: ReturnType<typeof parseStoreFilters>,
  offset: number,
) {
  const query = new URLSearchParams({
    status: filters.status,
    offset: String(Math.max(0, offset)),
  });
  if (filters.q) query.set("q", filters.q);
  return `/dashboard/stores?${query}`;
}

export function storeStatusLabel(status: string) {
  return (
    STORE_STATUS_LABELS[status as keyof typeof STORE_STATUS_LABELS] ?? status
  );
}

export function isStoreId(id: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}
