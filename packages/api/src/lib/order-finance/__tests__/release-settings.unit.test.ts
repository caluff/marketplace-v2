import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateStoresWorkflow } from "@medusajs/core-flows";
import { updatePaymentReleaseSettings } from "../../../workflows/update-payment-release-settings";
import { updatePaymentCaptureSettings } from "../../../workflows/update-payment-capture-settings";
import { automaticSettlementEnabled } from "../automatic-settlement";
import { automaticallySettleOrderFinance } from "../../../workflows/settle-order-finance";
import {
  parsePaymentReleaseSettings,
  readPaymentReleaseSettings,
} from "../release-settings";
import { withPaymentSettingsLock } from "../payment-settings-lock";
import { updatePaymentReleaseSettingsSchema } from "../contracts";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { protectPaymentSettingsMetadata } from "../../../api/admin/payment-release-settings/middlewares";
import orderCompletedSettlement from "../../../subscribers/order-completed-settlement";
import { recordOrderCompletionsWorkflow } from "../../../workflows/record-order-completions";
import { automaticallySettleOrdersBatch } from "../../../workflows/automatically-settle-orders";

jest.mock("../../../workflows/record-order-completions", () => ({
  recordOrderCompletionsWorkflow: jest.fn(),
}));

jest.mock("@medusajs/core-flows", () => ({
  ...jest.requireActual("@medusajs/core-flows"),
  updateStoresWorkflow: jest.fn(),
}));

const savedEnvironment = { ...process.env };
const listStores = jest.fn();
const graph = jest.fn();
const run = jest.fn();
const recordCompletion = jest.fn();
const owners = new Map<string, string>();
const acquire = jest.fn(
  async (key: string, options: { ownerId: string; expire?: number }) => {
    if (owners.has(key)) throw new Error("Occupied");
    owners.set(key, options.ownerId);
  },
);
const release = jest.fn(async (key: string, options: { ownerId: string }) => {
  if (owners.get(key) !== options.ownerId) return false;
  owners.delete(key);
  return true;
});
const container = {
  resolve(name: string) {
    if (name === Modules.STORE) return { listStores };
    if (name === Modules.LOCKING) return { acquire, release };
    if (name === ContainerRegistrationKeys.QUERY) return { graph };
    throw new Error(`Unexpected dependency: ${name}`);
  },
} as unknown as MedusaContainer;
const revision = "755f0a82-7cf6-4195-b833-825c955918dc";
const automatic = { mode: "automatic", revision, actor_id: "user_operator" };

beforeEach(() => {
  jest.clearAllMocks();
  owners.clear();
  process.env.STRIPE_API_KEY = "sk_test_disposable";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_disposable";
  process.env.STRIPE_PAYOUT_WEBHOOK_SECRET = "whsec_disposable";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "false";
  process.env.VENDOR_PUBLIC_URL = "http://localhost:7001";
  process.env.NODE_ENV = "test";
  listStores.mockResolvedValue([{ id: "store_test", metadata: null }]);
  graph.mockImplementation(async ({ filters }) => ({
    data: filters.id === "user_operator" ? [{ id: "user_operator" }] : [],
  }));
  jest
    .mocked(updateStoresWorkflow)
    .mockReturnValue({ run } as unknown as ReturnType<
      typeof updateStoresWorkflow
    >);
  run.mockResolvedValue({ result: {} });
  jest
    .mocked(recordOrderCompletionsWorkflow)
    .mockReturnValue({ run: recordCompletion } as unknown as ReturnType<
      typeof recordOrderCompletionsWorkflow
    >);
  recordCompletion.mockResolvedValue({ result: [] });
});
afterAll(() => {
  process.env = savedEnvironment;
});

it("uses legacy mode only until an explicit saved choice overrides it", async () => {
  expect(parsePaymentReleaseSettings(null).mode).toBe("manual");
  process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "true";
  expect(parsePaymentReleaseSettings(null)).toMatchObject({
    mode: "automatic",
    revision: "initial:automatic",
  });
  listStores.mockResolvedValue([
    {
      id: "store_test",
      metadata: { usapeek_payment_release: { ...automatic, mode: "manual" } },
    },
  ]);
  expect(await automaticSettlementEnabled(container)).toBe(false);
  process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "false";
  listStores.mockResolvedValue([
    { id: "store_test", metadata: { usapeek_payment_release: automatic } },
  ]);
  expect(await automaticSettlementEnabled(container)).toBe(true);
});

it("saves mode through the native workflow preserving capture and other metadata", async () => {
  const capture = { mode: "manual", revision, actor_id: "user_operator" };
  listStores.mockResolvedValue([
    {
      id: "store_test",
      metadata: { usapeek_payment_capture: capture, unrelated: "preserved" },
    },
  ]);
  const result = await updatePaymentReleaseSettings(container, {
    mode: "automatic",
    delay_days: 3,
    expected_revision: "initial:manual",
    actor_id: "user_operator",
  });
  expect(result).toMatchObject({
    settings: { mode: "automatic" },
    automatic_available: true,
  });
  expect(run).toHaveBeenCalledWith({
    input: {
      selector: { id: "store_test" },
      update: {
        metadata: {
          usapeek_payment_capture: capture,
          unrelated: "preserved",
          usapeek_payment_release: {
            mode: "automatic",
            delay_days: 3,
            revision: result.settings.revision,
            actor_id: "user_operator",
          },
        },
      },
    },
  });
  expect(owners.size).toBe(0);
});

it("rejects stale operators and does not reset the revision for the same choice", async () => {
  listStores.mockResolvedValue([
    { id: "store_test", metadata: { usapeek_payment_release: automatic } },
  ]);
  await expect(
    updatePaymentReleaseSettings(container, {
      mode: "manual",
      delay_days: 3,
      expected_revision: "initial:manual",
      actor_id: "user_operator",
    }),
  ).rejects.toThrow("Actualiza la página");
  expect(run).not.toHaveBeenCalled();
  expect(
    (
      await updatePaymentReleaseSettings(container, {
        mode: "automatic",
        delay_days: 3,
        expected_revision: revision,
        actor_id: "user_operator",
      })
    ).settings.revision,
  ).toBe(revision);
  expect(run).not.toHaveBeenCalled();
});

it("fails closed for damaged or ambiguous persisted configuration", async () => {
  expect(() =>
    parsePaymentReleaseSettings({
      usapeek_payment_release: { mode: "automatic" },
    }),
  ).toThrow();
  listStores.mockResolvedValue([]);
  await expect(readPaymentReleaseSettings(container)).rejects.toThrow(
    "identificar",
  );
  listStores.mockResolvedValue([{ id: "a" }, { id: "b" }]);
  await expect(readPaymentReleaseSettings(container)).rejects.toThrow(
    "identificar",
  );
});

it("defaults legacy metadata to three days and changes the delay without changing mode", async () => {
  expect(parsePaymentReleaseSettings(null).delay_days).toBe(3);
  expect(
    parsePaymentReleaseSettings({ usapeek_payment_release: automatic }),
  ).toMatchObject({
    delay_days: 3,
    revision,
  });
  listStores.mockResolvedValue([
    { id: "store_test", metadata: { usapeek_payment_release: automatic } },
  ]);
  const result = await updatePaymentReleaseSettings(container, {
    mode: "automatic",
    delay_days: 0,
    expected_revision: revision,
    actor_id: "user_operator",
  });
  expect(result.settings).toMatchObject({ mode: "automatic", delay_days: 0 });
  expect(result.settings.revision).not.toBe(revision);
  expect(run).toHaveBeenCalledTimes(1);
});

it.each([-1, 0.5, 366, Infinity, NaN, "1", null, undefined])(
  "rejects invalid release delay %s before settings or provider effects",
  async (delay) => {
    const body = {
      mode: "automatic",
      delay_days: delay,
      expected_revision: revision,
    };
    expect(updatePaymentReleaseSettingsSchema.safeParse(body).success).toBe(
      false,
    );
    expect(() =>
      parsePaymentReleaseSettings({
        usapeek_payment_release: {
          ...automatic,
          delay_days: delay === undefined ? null : delay,
        },
      }),
    ).toThrow();
    expect(run).not.toHaveBeenCalled();
  },
);

it.each(["missing", "live", "general-jobs"])(
  "refuses enabling automatic mode with unsafe %s configuration",
  async (condition) => {
    if (condition === "missing") delete process.env.STRIPE_API_KEY;
    if (condition === "live") process.env.STRIPE_API_KEY = "sk_live_disposable";
    if (condition === "general-jobs")
      process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "true";
    await expect(
      updatePaymentReleaseSettings(container, {
        mode: "automatic",
        delay_days: 3,
        expected_revision: "initial:manual",
        actor_id: "user_operator",
      }),
    ).rejects.toThrow("Stripe TEST");
    expect(run).not.toHaveBeenCalled();
    expect(await automaticSettlementEnabled(container)).toBe(false);
  },
);

it("requires an existing operator and rejects injected mode or extra fields", async () => {
  await expect(
    updatePaymentReleaseSettings(container, {
      mode: "automatic",
      delay_days: 3,
      expected_revision: "initial:manual",
      actor_id: "member_forged",
    }),
  ).rejects.toThrow("operador");
  expect(
    updatePaymentReleaseSettingsSchema.safeParse({
      mode: "invalid",
      delay_days: 3,
      expected_revision: "initial:manual",
    }).success,
  ).toBe(false);
  expect(
    updatePaymentReleaseSettingsSchema.safeParse({
      mode: "automatic",
      delay_days: 3,
      expected_revision: "initial:manual",
      actor_id: "user_forged",
    }).success,
  ).toBe(false);
  expect(run).not.toHaveBeenCalled();
});

it("prevents the native Store endpoint from bypassing payment permissions, revisions or locks", () => {
  const next = jest.fn();
  const response = {} as MedusaResponse;
  for (const metadata of [
    null,
    {},
    { unrelated: "replacement" },
    { usapeek_payment_release: automatic },
    { usapeek_payment_capture: automatic },
  ]) {
    const request = { body: { metadata } } as MedusaRequest<{
      metadata?: unknown;
    }>;
    expect(() =>
      protectPaymentSettingsMetadata(request, response, next),
    ).toThrow("exclusivamente");
  }
  expect(next).not.toHaveBeenCalled();
  protectPaymentSettingsMetadata(
    { body: {} } as MedusaRequest<{ metadata?: unknown }>,
    response,
    next,
  );
  expect(next).toHaveBeenCalledTimes(1);
});

it("manual mode stops the automatic executor before order reads or financial effects", async () => {
  await expect(
    automaticallySettleOrderFinance(container, "order_disposable"),
  ).rejects.toThrow("no está habilitada");
  expect(run).not.toHaveBeenCalled();
  expect(owners.size).toBe(0);
  expect(await automaticallySettleOrdersBatch(container)).toEqual({
    status: "disabled",
    evaluated: 0,
    settled: 0,
    held: 0,
  });
});

it("still observes completion in manual mode so a later mode change cannot restart retention", async () => {
  await orderCompletedSettlement({
    event: { data: { id: "order_completed" } },
    container,
  } as Parameters<typeof orderCompletedSettlement>[0]);
  expect(recordCompletion).toHaveBeenCalledWith({
    input: { order_ids: ["order_completed"] },
  });
  expect(run).not.toHaveBeenCalled();
});

it("never records completion with an unavailable financial integration", async () => {
  delete process.env.STRIPE_API_KEY;
  await orderCompletedSettlement({
    event: { data: { id: "order_completed" } },
    container,
  } as Parameters<typeof orderCompletedSettlement>[0]);
  expect(recordCompletion).not.toHaveBeenCalled();
});

it("propagates clock persistence failures so the native event bus can retry", async () => {
  recordCompletion.mockRejectedValueOnce(
    new Error("Clock persistence interrupted"),
  );
  await expect(
    orderCompletedSettlement({
      event: { data: { id: "order_completed" } },
      container,
    } as Parameters<typeof orderCompletedSettlement>[0]),
  ).rejects.toThrow("Clock persistence interrupted");
});

it("keeps both settings editors excluded until an in-flight automatic operation finishes", async () => {
  listStores.mockResolvedValue([
    { id: "store_test", metadata: { usapeek_payment_release: automatic } },
  ]);
  let finishOperation!: () => void;
  let operationStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    operationStarted = resolve;
  });
  const finish = new Promise<void>((resolve) => {
    finishOperation = resolve;
  });
  const operation = withPaymentSettingsLock(container, async () => {
    operationStarted();
    await finish;
  });
  await started;
  await expect(
    updatePaymentReleaseSettings(container, {
      mode: "manual",
      delay_days: 3,
      expected_revision: revision,
      actor_id: "user_operator",
    }),
  ).rejects.toThrow("operación de pagos en curso");
  await expect(
    updatePaymentCaptureSettings(container, {
      mode: "automatic",
      expected_revision: "initial",
      actor_id: "user_operator",
    }),
  ).rejects.toThrow("operación de pagos en curso");
  expect(run).not.toHaveBeenCalled();
  expect(acquire.mock.calls[0][1]).not.toHaveProperty("expire");
  finishOperation();
  await operation;
  await updatePaymentReleaseSettings(container, {
    mode: "manual",
    delay_days: 3,
    expected_revision: revision,
    actor_id: "user_operator",
  });
  expect(run).toHaveBeenCalledTimes(1);
});

it("releases a failed operation's owner and never clears another owner's lock", async () => {
  await expect(
    withPaymentSettingsLock(container, async () => {
      throw new Error("Provider failed");
    }),
  ).rejects.toThrow("Provider failed");
  expect(owners.size).toBe(0);
  await expect(
    withPaymentSettingsLock(container, async () => {
      const key = acquire.mock.calls[acquire.mock.calls.length - 1][0];
      owners.set(key, "different-owner");
    }),
  ).rejects.toThrow("bloqueo de configuración");
  expect([...owners.values()]).toEqual(["different-owner"]);
});
