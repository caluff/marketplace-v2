"use server";

import { unstable_rethrow } from "next/navigation";
import { listVendorApplications } from "./data";
import { APPLICATION_PAGE_SIZE } from "./helpers";
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
      limit: APPLICATION_PAGE_SIZE,
    });
    return pendingStatusFromCount(count);
  } catch (error) {
    unstable_rethrow(error);
    return "unknown";
  }
}
