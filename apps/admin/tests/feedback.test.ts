import assert from "node:assert/strict";
import test from "node:test";
import { toast } from "sonner";
import { notifyFeedback, withFeedbackToast } from "../src/lib/feedback";

test("feedback uses semantic Sonner types, including pending decisions and MFA", (t) => {
  const calls: { type: string; message: unknown }[] = [];
  for (const type of ["success", "error", "warning", "info"] as const)
    t.mock.method(toast, type, (message: unknown) => {
      calls.push({ type, message });
      return calls.length;
    });
  for (const status of ["success", "error", "warning", "conflict", "processing", "mfa_required", "external_redirect"])
    notifyFeedback({ status, message: status });
  assert.deepEqual(calls, [
    { type: "success", message: "success" },
    { type: "error", message: "error" },
    { type: "warning", message: "warning" },
    { type: "warning", message: "conflict" },
    { type: "warning", message: "processing" },
    { type: "warning", message: "mfa_required" },
    { type: "info", message: "external_redirect" },
  ]);
});

test("idle and empty feedback never notify", (t) => {
  for (const type of ["success", "error", "warning", "info"] as const)
    t.mock.method(toast, type, () => assert.fail("Unexpected notification"));
  notifyFeedback({ status: "idle", message: "Not submitted" });
  notifyFeedback({ status: "error" });
  notifyFeedback({ status: "success", message: "" });
});

test("completed actions preserve fields and recovery links and notify each repeated attempt", async (t) => {
  const notify = t.mock.method(toast, "error", () => 1);
  const state = {
    status: "error",
    message: "Revisa los campos indicados.",
    fieldErrors: { email: "Correo inválido" },
    externalUrl: "https://provider.example/continue",
  };
  const form = new FormData();
  const previous = { status: "idle" };
  const action = withFeedbackToast(async (received: typeof previous, data: FormData) => {
    assert.equal(received, previous);
    assert.equal(data, form);
    return state;
  });
  assert.equal(await action(previous, form), state);
  assert.equal(await action(previous, form), state);
  assert.equal(notify.mock.callCount(), 2);
});

test("unexpected failures and framework redirects propagate without claiming success", async (t) => {
  for (const type of ["success", "error", "warning", "info"] as const)
    t.mock.method(toast, type, () => assert.fail("Unexpected notification"));
  for (const message of ["Network unavailable", "NEXT_REDIRECT"]) {
    const error = new Error(message);
    const action = withFeedbackToast(async () => { throw error; });
    await assert.rejects(action(), (caught) => caught === error);
  }
});

test("an in-flight action does not announce success until it actually completes", async (t) => {
  const notify = t.mock.method(toast, "success", () => 1);
  const deferred = Promise.withResolvers<{ status: string; message: string }>();
  const action = withFeedbackToast(() => deferred.promise);
  const pending = action();
  assert.equal(notify.mock.callCount(), 0);
  deferred.resolve({ status: "success", message: "Decisión guardada." });
  await pending;
  assert.equal(notify.mock.callCount(), 1);
});
