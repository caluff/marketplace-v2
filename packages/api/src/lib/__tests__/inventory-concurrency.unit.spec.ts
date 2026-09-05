import type { Context } from "@medusajs/framework/types";
import { LockMode } from "@medusajs/framework/mikro-orm/core";
import { MathBN } from "@medusajs/framework/utils";
import { InventoryLevelRepository as NativeLevelRepository } from "@medusajs/inventory/dist/repositories";
import InventoryModuleService from "../../modules/inventory/service";
import { InventoryLevelRepository } from "../../modules/inventory/repositories/inventory-repositories";
import { inventoryLockOptions } from "../inventory/locking-options";
import { vendorInventoryAdjustmentSchema } from "../inventory/validation";

const input = { inventory_item_id: "item_1", location_id: "loc_1", expected_quantity: 10, stocked_quantity: 5 };

// Exercise the installed native module methods and our real repository override.
// The fixture models transactions/row locking, not a PostgreSQL integration test.
function fixture(reserved = 0) {
  let committed = { id: "level_1", inventory_item_id: "item_1", location_id: "loc_1", stocked_quantity: 10, reserved_quantity: reserved };
  type Row = typeof committed;
  type Transaction = { row?: Row; unlock?: () => void; fail?: boolean };
  let tail = Promise.resolve();
  let shouldFail = false;
  const lockReads: unknown[] = [];
  const baseRepository = {
    getFreshManager: () => ({}),
    serialize: async <T>(data: T): Promise<T> => data,
    transaction: async <T>(work: (manager: Transaction) => Promise<T>): Promise<T> => {
      const transaction: Transaction = {};
      try {
        const result = await work(transaction);
        if (shouldFail) throw new Error("Simulated failure before commit");
        if (transaction.row) committed = { ...transaction.row };
        return result;
      } finally {
        transaction.unlock?.();
      }
    },
  };
  const repository: InventoryLevelRepository = Object.create(InventoryLevelRepository.prototype);
  jest.spyOn(NativeLevelRepository.prototype, "find").mockImplementation(async (options, context) => {
    const transaction = context!.transactionManager as Transaction;
    lockReads.push(options?.options);
    const locked = options?.options as { lockMode?: LockMode; refresh?: boolean };
    if (locked?.lockMode !== LockMode.PESSIMISTIC_WRITE || !locked.refresh) throw new Error("A native writer read without a refreshing row lock");
    if (!transaction.unlock) {
      const previous = tail;
      tail = new Promise<void>(resolve => { transaction.unlock = resolve; });
      await previous;
      transaction.row = { ...committed };
    }
    return [{ ...transaction.row, available_quantity: MathBN.sub(transaction.row!.stocked_quantity, transaction.row!.reserved_quantity) }] as unknown as Awaited<ReturnType<NativeLevelRepository["find"]>>;
  });
  const inventoryLevelService = {
    list: async (filters: object, _config: object, context: Context) => repository.find({ where: filters }, context),
    update: async (updates: { stocked_quantity?: number; reserved_quantity?: number } | { stocked_quantity?: number; reserved_quantity?: number }[], context: Context) => {
      const transaction = context.transactionManager as Transaction;
      const array = Array.isArray(updates) ? updates : [updates];
      const rows = array.map(update => {
        if (update.stocked_quantity !== undefined) transaction.row!.stocked_quantity = Number(update.stocked_quantity);
        if (update.reserved_quantity !== undefined) transaction.row!.reserved_quantity = Number(update.reserved_quantity);
        return { ...transaction.row! };
      });
      return Array.isArray(updates) ? rows : rows[0];
    },
  };
  const reservationItemService = { create: async (data: object[]) => data.map((row, i) => ({ id: `res_${i}`, ...row })) };
  const emit = jest.fn();
  const service = new InventoryModuleService({ baseRepository, inventoryLevelService, inventoryItemService: {}, reservationItemService, event_bus: { emit } } as unknown as ConstructorParameters<typeof InventoryModuleService>[0]);
  return { service, emit, lockReads, row: () => committed, failCommit: () => { shouldFail = true; } };
}

afterEach(() => jest.restoreAllMocks());

describe("inventory transaction concurrency", () => {
  it("allows only one of two simultaneous edits with the same stale expectation", async () => {
    const { service, row } = fixture();
    const results = await Promise.allSettled([
      service.compareAndSetInventory({ ...input, stocked_quantity: 12 }),
      service.compareAndSetInventory({ ...input, stocked_quantity: 14 }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { type: "conflict" } });
    expect(row().stocked_quantity).toBe(12);
  });

  it.each([true, false])("serializes a native reservation and vendor reduction (reservation first: %s)", async (reservationFirst) => {
    const { service, row } = fixture();
    const reserve = () => service.createReservationItems({ inventory_item_id: input.inventory_item_id, location_id: input.location_id, quantity: 8 });
    const edit = () => service.compareAndSetInventory(input);
    const results = await Promise.allSettled(reservationFirst ? [reserve(), edit()] : [edit(), reserve()]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(row().stocked_quantity).toBeGreaterThanOrEqual(row().reserved_quantity);
    expect(row()).toMatchObject(reservationFirst ? { stocked_quantity: 10, reserved_quantity: 8 } : { stocked_quantity: 5, reserved_quantity: 0 });
  });

  it("keeps a native fulfillment stock delta after a concurrent vendor edit", async () => {
    const { service, row } = fixture();
    await Promise.all([
      service.compareAndSetInventory({ ...input, stocked_quantity: 12 }),
      service.adjustInventory(input.inventory_item_id, input.location_id, -1, {}),
    ]);
    expect(row().stocked_quantity).toBe(11);
  });

  it("rejects the vendor edit when a native stock writer commits first", async () => {
    const { service, row } = fixture();
    const results = await Promise.allSettled([
      service.updateInventoryLevels({ inventory_item_id: input.inventory_item_id, location_id: input.location_id, stocked_quantity: 9 }),
      service.compareAndSetInventory(input),
    ]);
    expect(results[1]).toMatchObject({ status: "rejected", reason: { type: "conflict" } });
    expect(row().stocked_quantity).toBe(9);
  });

  it("rolls back a failed transaction and does not emit success events", async () => {
    const { service, row, failCommit, emit } = fixture();
    failCommit();
    await expect(service.compareAndSetInventory(input)).rejects.toThrow("before commit");
    expect(row().stocked_quantity).toBe(10);
    expect(emit).not.toHaveBeenCalled();
  });

  it("preserves native backorders while forbidding vendor counts below locked reservations", async () => {
    const { service, row } = fixture();
    await service.createReservationItems({ inventory_item_id: input.inventory_item_id, location_id: input.location_id, quantity: 12, allow_backorder: true });
    expect(row().reserved_quantity).toBe(12);
    await expect(service.compareAndSetInventory(input)).rejects.toMatchObject({ type: "conflict" });
    expect(row().stocked_quantity).toBe(10);
  });

  it("allows a count equal to reservations and returns refreshed availability without changing reservations", async () => {
    const { service, row } = fixture(5);
    const level = await service.compareAndSetInventory(input);
    expect(Number(level.available_quantity)).toBe(0);
    expect(row()).toMatchObject({ stocked_quantity: 5, reserved_quantity: 5 });
  });

  it("keeps nontransactional reads unlocked and locks transactional batches in ID order with fresh data", () => {
    const options = { where: {}, options: { orderBy: { id: "DESC" as const } } };
    expect(inventoryLockOptions(options)).toBe(options);
    expect(inventoryLockOptions(options, { transactionManager: {} }).options).toMatchObject({ lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true, orderBy: { id: "ASC" } });
  });

  it.each([-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "10"])("rejects invalid quantity %s on the backend", quantity => {
    expect(vendorInventoryAdjustmentSchema.safeParse({ ...input, stocked_quantity: quantity }).success).toBe(false);
    expect(vendorInventoryAdjustmentSchema.safeParse({ ...input, expected_quantity: quantity }).success).toBe(false);
  });

  it("rejects attempts to supply reserved quantities or seller scope", () => {
    expect(vendorInventoryAdjustmentSchema.safeParse({ ...input, reserved_quantity: 0 }).success).toBe(false);
    expect(vendorInventoryAdjustmentSchema.safeParse({ ...input, seller_id: "seller_other" }).success).toBe(false);
  });
});
