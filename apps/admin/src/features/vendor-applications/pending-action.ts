"use server";

import { getAdminNotificationStatus } from "@/features/realtime/status-read";
import type { PendingApplicationStatus } from "./pending-status";

export async function getPendingApplicationStatus(): Promise<PendingApplicationStatus> {
  const { applications } = await getAdminNotificationStatus();
  return applications.status === "ready"
    ? applications.has_pending
      ? "pending"
      : "clear"
    : "unknown";
}
