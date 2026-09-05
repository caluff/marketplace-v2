import assert from "node:assert/strict";
import { test } from "node:test";
import { toast } from "sonner";
import { notifyFeedback } from "./feedback";

test("silent states do not create notifications", () => {
  const before = toast.getHistory().length;
  notifyFeedback(null);
  notifyFeedback({ status: "idle", message: "Ignored" });
  notifyFeedback({ status: "success" });
  assert.equal(toast.getHistory().length, before);
});

test("results use semantic Sonner types", () => {
  for (const [status, expected] of [
    ["success", "success"], ["error", "error"], ["warning", "warning"],
    ["conflict", "warning"], ["mfa_required", "warning"],
    ["verification_required", "warning"], ["external_redirect", "info"],
  ]) {
    const id = notifyFeedback({ status, message: `Result: ${status}` });
    const notification = toast.getHistory().find((entry) => entry.id === id);
    assert.ok(notification && "type" in notification && "title" in notification);
    assert.equal(notification?.type, expected);
    assert.equal(notification?.title, `Result: ${status}`);
  }
});

test("repeated failed attempts each notify", () => {
  const first = notifyFeedback({ status: "error", message: "Inténtalo nuevamente." });
  const second = notifyFeedback({ status: "error", message: "Inténtalo nuevamente." });
  assert.notEqual(first, second);
});
