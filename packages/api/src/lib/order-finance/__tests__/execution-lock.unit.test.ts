import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../../../modules/commerce-automation";
import { withFinanceExecutionLock } from "../execution-lock";

function setup() {
  const scope = { groupId: "group_fixture", cartId: "cart_fixture" };
  const prior = {
    execution_owner_id: "104b6cae-d7e1-435e-b50b-ed82b80508a7",
    execution_host: "other-host",
    execution_pid: 1234,
  };
  const locking = {
    acquire: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(true),
  };
  const journal = {
    registerFinanceExecutionWriter: jest.fn().mockResolvedValue([prior]),
    removeFinanceExecutionWriter: jest.fn().mockResolvedValue(undefined),
  };
  const container = {
    resolve: jest.fn((key: string) => {
      if (key === Modules.LOCKING) return locking;
      if (key === COMMERCE_AUTOMATION_MODULE) return journal;
      throw new Error(`Unexpected resolution ${key}`);
    }),
  } as unknown as MedusaContainer;
  const work = jest.fn().mockResolvedValue("completed");
  return { scope, prior, locking, journal, container, work };
}

describe("durable financial execution lock acquisition", () => {
  it("removes only the new writer after Redis acknowledges contention, without releasing the competing lock", async () => {
    const { scope, locking, journal, container, work } = setup();
    const conflict = new MedusaError(
      MedusaError.Types.CONFLICT,
      "Failed to acquire lock for key cart_fixture",
    );
    locking.acquire.mockRejectedValue(conflict);
    await expect(withFinanceExecutionLock(container, scope, work)).rejects.toBe(
      conflict,
    );
    const ownerId =
      journal.registerFinanceExecutionWriter.mock.calls[0][0].writer
        .execution_owner_id;
    expect(journal.removeFinanceExecutionWriter.mock.calls).toEqual([
      [{ ...scope, ownerId }],
    ]);
    expect(locking.release).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it("retains the writer identity when a transport failure can hide a successful unexpiring lock acquisition", async () => {
    const { scope, locking, journal, container, work } = setup();
    const connectionLost = new Error("Connection lost after Redis SET");
    locking.acquire.mockRejectedValue(connectionLost);
    await expect(withFinanceExecutionLock(container, scope, work)).rejects.toBe(
      connectionLost,
    );
    expect(journal.registerFinanceExecutionWriter).toHaveBeenCalledTimes(1);
    expect(journal.removeFinanceExecutionWriter).not.toHaveBeenCalled();
    expect(locking.release).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it("cleans a refused recovery acquisition without deleting an unverified prior writer", async () => {
    const { scope, prior, locking, journal, container, work } = setup();
    const conflict = new MedusaError(
      MedusaError.Types.CONFLICT,
      "Lock held by another process",
    );
    locking.acquire.mockRejectedValue(conflict);
    await expect(
      withFinanceExecutionLock(container, scope, work, {
        releaseStoppedWriter: true,
        priorWriter: prior,
      }),
    ).rejects.toBe(conflict);
    const ownerId =
      journal.registerFinanceExecutionWriter.mock.calls[0][0].writer
        .execution_owner_id;
    expect(journal.removeFinanceExecutionWriter.mock.calls).toEqual([
      [{ ...scope, ownerId }],
    ]);
    expect(ownerId).not.toBe(prior.execution_owner_id);
    expect(locking.release).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it("releases and removes the acquired owner after the callback fails", async () => {
    const { scope, locking, journal, container, work } = setup();
    const callbackFailure = new Error("Persisted callback boundary failure");
    work.mockRejectedValue(callbackFailure);
    await expect(withFinanceExecutionLock(container, scope, work)).rejects.toBe(
      callbackFailure,
    );
    const ownerId =
      journal.registerFinanceExecutionWriter.mock.calls[0][0].writer
        .execution_owner_id;
    expect(locking.release.mock.calls).toEqual([[scope.cartId, { ownerId }]]);
    expect(journal.removeFinanceExecutionWriter.mock.calls).toEqual([
      [{ ...scope, ownerId }],
    ]);
  });
});
