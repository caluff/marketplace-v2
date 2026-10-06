import assert from "node:assert/strict";
import { test } from "node:test";
import {
  saveCaptureSettings,
  captureSettingsErrorMessage,
} from "./capture-settings";

test("sends only the selected mode and concurrency revision to the typed SDK", async () => {
  const calls: unknown[] = [];
  const client = {
    fetch: async (...args: unknown[]) => {
      calls.push(args);
      return {};
    },
  };
  const form = new FormData();
  form.set("mode", "automatic");
  form.set("expected_revision", "initial");
  form.set("actor_id", "user_untrusted");
  const result = await saveCaptureSettings(
    client as Parameters<typeof saveCaptureSettings>[0],
    form,
  );
  assert.equal(result.status, "success");
  assert.deepEqual(calls, [
    [
      "/admin/payment-capture-settings",
      {
        method: "POST",
        body: { mode: "automatic", expected_revision: "initial" },
      },
    ],
  ]);
});

test("rejects duplicated mode fields before making a request", async () => {
  const form = new FormData();
  form.append("mode", "manual");
  form.append("mode", "automatic");
  form.set("expected_revision", "initial");
  const client = {
    fetch: async () => {
      throw new Error("must not request");
    },
  };
  const result = await saveCaptureSettings(
    client as Parameters<typeof saveCaptureSettings>[0],
    form,
  );
  assert.equal(result.status, "error");
});

test("explains stale settings without silently overriding a saved mode", () => {
  assert.match(
    captureSettingsErrorMessage(409),
    /Actualiza la página antes de guardar/,
  );
});
