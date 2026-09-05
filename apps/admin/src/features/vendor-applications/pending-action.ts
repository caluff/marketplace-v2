"use server";

import { unstable_rethrow } from "next/navigation";
import { listVendorApplications } from "./data";
import {
  pendingStatusFromCount,
  type PendingApplicationStatus,
} from "./pending-status";

export async function getPendingApplicationStatus(): Promise<PendingApplicationStatus> {
  try {
    const { count } = await listVendorApplications({
      status: "submitted",
      q: "",
      offset: 0,
      limit: 1,
    });
    return pendingStatusFromCount(count);
  } catch (error) {
    unstable_rethrow(error);
    return "unknown";
  }
}
