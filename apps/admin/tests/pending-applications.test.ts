import assert from "node:assert/strict";
import test from "node:test";
import {
  pendingStatusFromCount,
  shouldRefreshPendingStatus,
} from "../src/features/vendor-applications/pending-status";

test("pending status distinguishes a real queue, an empty queue and invalid counts", () => {
  assert.equal(pendingStatusFromCount(1), "pending");
  assert.equal(pendingStatusFromCount(0), "clear");
  for (const count of [-1, NaN, Infinity, 0.5])
    assert.equal(pendingStatusFromCount(count), "unknown");
});
test("focus/navigation refreshes are bounded, deduplicated and decisions invalidate immediately", () => {
  assert.equal(shouldRefreshPendingStatus(1, null, false), true);
  assert.equal(shouldRefreshPendingStatus(59_999, 0, false), false);
  assert.equal(shouldRefreshPendingStatus(60_000, 0, false), true);
  assert.equal(shouldRefreshPendingStatus(1, 0, false, true), true);
  assert.equal(shouldRefreshPendingStatus(60_000, 0, true, true), false);
});
