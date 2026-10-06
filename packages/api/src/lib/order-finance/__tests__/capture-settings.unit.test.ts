import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { updateStoresWorkflow } from "@medusajs/core-flows";
import { updatePaymentCaptureSettings } from "../../../workflows/update-payment-capture-settings";

jest.mock("@medusajs/core-flows", () => ({
  updateStoresWorkflow: jest.fn(),
}));

const listStores = jest.fn();
const run = jest.fn();
const acquire = jest.fn().mockResolvedValue(undefined);
const release = jest.fn().mockResolvedValue(true);
const container = {
  resolve: (name: string) => {
    if (name === Modules.STORE) return { listStores };
    if (name === Modules.LOCKING) return { acquire, release };
    throw new Error(`Unexpected dependency: ${name}`);
  },
} as unknown as MedusaContainer;
const revision = "755f0a82-7cf6-4195-b833-825c955918dc";

beforeEach(() => {
  jest.clearAllMocks();
  listStores.mockResolvedValue([
    { id: "store_test", metadata: { unrelated_setting: "preserved" } },
  ]);
  jest
    .mocked(updateStoresWorkflow)
    .mockReturnValue({ run } as unknown as ReturnType<
      typeof updateStoresWorkflow
    >);
  run.mockResolvedValue({ result: {} });
});

it("saves automatic mode through the native workflow without losing other settings", async () => {
  const result = await updatePaymentCaptureSettings(container, {
    mode: "automatic",
    expected_revision: "initial",
    actor_id: "user_operator",
  });
  expect(run).toHaveBeenCalledWith({
    input: {
      selector: { id: "store_test" },
      update: {
        metadata: {
          unrelated_setting: "preserved",
          usapeek_payment_capture: {
            mode: "automatic",
            revision: result.settings.revision,
            actor_id: "user_operator",
          },
        },
      },
    },
  });
  expect(result.settings).toEqual({
    mode: "automatic",
    revision: expect.any(String),
  });
  expect(result.settings.revision).not.toBe("initial");
});

it("rejects stale updates instead of overwriting another operator's choice", async () => {
  listStores.mockResolvedValue([
    {
      id: "store_test",
      metadata: {
        usapeek_payment_capture: {
          mode: "automatic",
          revision,
          actor_id: "user_other",
        },
      },
    },
  ]);
  await expect(
    updatePaymentCaptureSettings(container, {
      mode: "manual",
      expected_revision: "initial",
      actor_id: "user_operator",
    }),
  ).rejects.toThrow("Actualiza la página");
  expect(run).not.toHaveBeenCalled();
});

it("does not change the revision when resubmitting the current mode", async () => {
  expect(
    await updatePaymentCaptureSettings(container, {
      mode: "manual",
      expected_revision: "initial",
      actor_id: "user_operator",
    }),
  ).toEqual({ settings: { mode: "manual", revision: "initial" } });
  expect(run).not.toHaveBeenCalled();
});

it("rejects seller identities and unknown modes before persistence", async () => {
  await expect(
    updatePaymentCaptureSettings(container, {
      mode: "automatic",
      expected_revision: "initial",
      actor_id: "seller_test",
    }),
  ).rejects.toThrow("operador");
  await expect(
    updatePaymentCaptureSettings(container, {
      mode: "invalid",
      expected_revision: "initial",
      actor_id: "user_operator",
    } as unknown as Parameters<typeof updatePaymentCaptureSettings>[1]),
  ).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});
