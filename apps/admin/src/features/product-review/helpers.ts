export const PRODUCT_STATUS_LABELS = {
  proposed: "Propuesto",
  draft: "Borrador",
  published: "Publicado",
  rejected: "Rechazado",
};

export function parseProductReviewFilters(
  params: Record<string, string | string[] | undefined>,
) {
  const status =
    typeof params.status === "string" &&
    (params.status === "all" ||
      Object.hasOwn(PRODUCT_STATUS_LABELS, params.status))
      ? (params.status as keyof typeof PRODUCT_STATUS_LABELS | "all")
      : "proposed";
  const offset = typeof params.offset === "string" ? Number(params.offset) : 0;
  return {
    status,
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : "",
    limit: 20,
    offset:
      Number.isSafeInteger(offset) && offset >= 0
        ? Math.min(offset, 1_000_000)
        : 0,
  };
}

export function isProductReviewId(value: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

export function productReviewHref(
  filters: ReturnType<typeof parseProductReviewFilters>,
  offset: number,
) {
  const query = new URLSearchParams({
    status: filters.status,
    offset: String(Math.max(0, offset)),
  });
  if (filters.q) query.set("q", filters.q);
  return `/dashboard/product-review?${query}`;
}

export type ProductReviewState = {
  status: "idle" | "success" | "error";
  message?: string;
};
export type ProductReviewDecision =
  "publish" | "request_changes" | "reject" | "confirm_change" | "cancel_change";

export function parseProductReviewDecision(
  value: FormDataEntryValue | null,
): ProductReviewDecision | null {
  return value === "publish" ||
    value === "request_changes" ||
    value === "reject" ||
    value === "confirm_change" ||
    value === "cancel_change"
    ? value
    : null;
}
