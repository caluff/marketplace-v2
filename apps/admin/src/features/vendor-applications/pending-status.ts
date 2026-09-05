export type PendingApplicationStatus = "pending" | "clear" | "unknown";
export const PENDING_STATUS_REFRESH_MS = 60_000;

export function pendingStatusFromCount(
  count: number,
): PendingApplicationStatus {
  if (!Number.isSafeInteger(count) || count < 0) return "unknown";
  return count > 0 ? "pending" : "clear";
}

export function shouldRefreshPendingStatus(
  now: number,
  lastAttempt: number | null,
  inFlight: boolean,
  force = false,
) {
  return (
    !inFlight &&
    (force ||
      lastAttempt === null ||
      now - lastAttempt >= PENDING_STATUS_REFRESH_MS)
  );
}
