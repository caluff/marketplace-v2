import assert from "node:assert/strict";
import { test } from "node:test";
import {
  readReleaseSettings,
  parseReleaseDelayDays,
  releaseDelayLabel,
  releaseSettingsErrorMessage,
  saveReleaseSettings,
} from "./release-settings";

type Client = Parameters<typeof readReleaseSettings>[0];

function clientReturning(response: unknown, calls: unknown[] = []): Client {
  return {
    fetch: async (...args: unknown[]) => {
      calls.push(args);
      return response;
    },
  } as Client;
}

function releaseForm(
  mode = "automatic",
  revision = "initial",
  delayDays = "3",
): FormData {
  const form = new FormData();
  form.set("mode", mode);
  form.set("expected_revision", revision);
  form.set("delay_days", delayDays);
  return form;
}

test("reads the saved mode without a cache and keeps automatic availability separate", async () => {
  const calls: unknown[] = [];
  const saved = {
    settings: { mode: "automatic", delay_days: 3, revision: "saved-revision" },
    automatic_available: false,
  };
  assert.deepEqual(
    await readReleaseSettings(clientReturning(saved, calls)),
    saved,
  );
  assert.deepEqual(calls, [
    ["/admin/payment-release-settings", { cache: "no-store" }],
  ]);
});

test("fails an unavailable or malformed settings read instead of inventing manual mode", async () => {
  for (const response of [
    null,
    {},
    {
      settings: { mode: "unknown", delay_days: 3, revision: "initial" },
      automatic_available: true,
    },
    {
      settings: { mode: "manual", delay_days: 3, revision: "" },
      automatic_available: true,
    },
    {
      settings: { mode: "manual", delay_days: 3, revision: "initial" },
      automatic_available: "true",
    },
  ])
    await assert.rejects(readReleaseSettings(clientReturning(response)));

  await assert.rejects(
    readReleaseSettings({
      fetch: async () => {
        throw new Error("connection unavailable");
      },
    } as Client),
    /connection unavailable/,
  );
});

test("saves mode, remembered delay and revision atomically through the SDK", async () => {
  const calls: unknown[] = [];
  const form = releaseForm();
  form.set("actor_id", "user_untrusted");
  form.set("automatic_available", "true");
  const result = await saveReleaseSettings(
    clientReturning(
      {
        settings: {
          mode: "automatic",
          delay_days: 3,
          revision: "new-revision",
        },
        automatic_available: true,
      },
      calls,
    ),
    form,
  );
  assert.equal(result.status, "success");
  assert.deepEqual(calls, [
    [
      "/admin/payment-release-settings",
      {
        method: "POST",
        body: {
          mode: "automatic",
          delay_days: 3,
          expected_revision: "initial",
        },
      },
    ],
  ]);
});

test("rejects invalid modes, revisions and duplicated inputs before sending", async () => {
  const duplicateMode = releaseForm();
  duplicateMode.append("mode", "manual");
  const duplicateRevision = releaseForm();
  duplicateRevision.append("expected_revision", "other");
  const duplicateDelay = releaseForm();
  duplicateDelay.append("delay_days", "0");
  const calls: unknown[] = [];
  for (const form of [
    releaseForm("unknown"),
    releaseForm("manual", ""),
    releaseForm("manual", "x".repeat(65)),
    duplicateMode,
    duplicateRevision,
    duplicateDelay,
  ])
    assert.equal(
      (await saveReleaseSettings(clientReturning({}, calls), form)).status,
      "error",
    );
  assert.equal(calls.length, 0);
});

test("never confirms a save when the response omits or contradicts the requested settings", async () => {
  for (const response of [
    {},
    {
      settings: { mode: "manual", delay_days: 3, revision: "new" },
      automatic_available: true,
    },
    {
      settings: { mode: "automatic", delay_days: 3, revision: "new" },
      automatic_available: false,
    },
    {
      settings: { mode: "automatic", delay_days: 1, revision: "new" },
      automatic_available: true,
    },
  ]) {
    const result = await saveReleaseSettings(
      clientReturning(response),
      releaseForm(),
    );
    assert.equal(result.status, "error");
    assert.match(result.message ?? "", /Actualiza la página/);
  }
});

test("allows returning to manual when automatic release is unavailable", async () => {
  assert.equal(
    (
      await saveReleaseSettings(
        clientReturning({
          settings: { mode: "manual", delay_days: 3, revision: "new" },
          automatic_available: false,
        }),
        releaseForm("manual"),
      )
    ).status,
    "success",
  );
});

test("accepts immediate and 365-day settings while rejecting fractional or unbounded input", async () => {
  const calls: unknown[] = [];
  for (const value of ["", "-1", "1.5", "366", "1e2", "NaN", "Infinity"]) {
    assert.equal(parseReleaseDelayDays(value), null);
    assert.equal(
      (
        await saveReleaseSettings(
          clientReturning({}, calls),
          releaseForm("automatic", "initial", value),
        )
      ).status,
      "error",
    );
  }
  assert.equal(calls.length, 0);
  for (const value of ["0", "1", "2", "3", "7", "365"])
    assert.equal(
      (
        await saveReleaseSettings(
          clientReturning({
            settings: {
              mode: "automatic",
              delay_days: Number(value),
              revision: "new",
            },
            automatic_available: true,
          }),
          releaseForm("automatic", "initial", value),
        )
      ).status,
      "success",
    );
  assert.equal(releaseDelayLabel(0), "Inmediato");
  assert.equal(releaseDelayLabel(1), "1 día");
  assert.equal(releaseDelayLabel(3), "3 días");
  assert.equal(releaseDelayLabel(7), "Una semana");
});

test("rejects absent, fractional or out-of-range saved delays instead of using a fabricated default", async () => {
  for (const delayDays of [undefined, null, "3", -1, 1.5, 366])
    await assert.rejects(
      readReleaseSettings(
        clientReturning({
          settings: {
            mode: "automatic",
            delay_days: delayDays,
            revision: "saved",
          },
          automatic_available: true,
        }),
      ),
    );
});

test("preserves a custom waiting period when switching to manual", async () => {
  const calls: unknown[] = [];
  const result = await saveReleaseSettings(
    clientReturning(
      {
        settings: { mode: "manual", delay_days: 7, revision: "new" },
        automatic_available: false,
      },
      calls,
    ),
    releaseForm("manual", "saved", "7"),
  );
  assert.equal(result.status, "success");
  assert.deepEqual(calls, [
    [
      "/admin/payment-release-settings",
      {
        method: "POST",
        body: { mode: "manual", delay_days: 7, expected_revision: "saved" },
      },
    ],
  ]);
});

test("requires refreshing stale settings and identifies authorization failures", () => {
  assert.match(
    releaseSettingsErrorMessage(409),
    /Actualiza la página antes de guardar/,
  );
  assert.match(releaseSettingsErrorMessage(401), /sesión venció/);
  assert.match(releaseSettingsErrorMessage(403), /no tiene permisos/);
});
