import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer, mergeMetadata } from "@medusajs/framework/utils";
import { updateCustomerFavoriteWorkflow } from "../update-customer-favorite";

function createWorkflowFixture(options: {
  productAvailable?: boolean;
  failEvent?: boolean;
  initialMetadata?: Record<string, unknown>;
} = {}) {
  const operations: string[] = [];
  let metadata: Record<string, unknown> = options.initialMetadata ?? {
    account_favorite_product_ids: ["prod_existing"], preference: "keep",
  };
  const container = createMedusaContainer();
  const updateCustomers = jest.fn(async (_selector, update) => {
    operations.push("update");
    metadata = mergeMetadata(metadata, update.metadata);
    return [{ id: "cus_current", metadata }];
  });
  const locking = {
    acquire: jest.fn(async (_key: string | string[], _options?: { ownerId?: string }) => {
      operations.push("lock");
    }),
    release: jest.fn(async (_key: string | string[], _options?: { ownerId?: string }) => {
      operations.push("unlock");
      return true;
    }),
  };
  container.register({
    query: asValue({ graph: jest.fn(async ({ entity }) => {
      operations.push(`read:${entity}`);
      return { data: entity === "customer"
        ? [{ id: "cus_current", metadata: structuredClone(metadata) }]
        : options.productAvailable === false ? [] : [{ id: "prod_added", status: "published" }],
      };
    }) }),
    customer: asValue({
      listCustomers: jest.fn(async () => [{ id: "cus_current", metadata: structuredClone(metadata) }]),
      updateCustomers,
    }),
    locking: asValue(locking),
    event_bus: asValue({
      emit: jest.fn(async () => { if (options.failEvent) throw new Error("Event bus unavailable"); }),
      releaseGroupedEvents: jest.fn().mockResolvedValue(undefined),
      clearGroupedEvents: jest.fn().mockResolvedValue(undefined),
    }),
    logger: asValue({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }),
  });
  return { container, operations, updateCustomers, locking, getMetadata: () => metadata };
}

describe("customer favorite workflow execution", () => {
  const input = { customer_id: "cus_current", product_id: "prod_added", saved: true };

  it("locks before reading current favorites and preserves unrelated metadata", async () => {
    const fixture = createWorkflowFixture();
    await updateCustomerFavoriteWorkflow(fixture.container).run({ input });

    expect(fixture.operations).toEqual(["lock", "read:customer", "read:product", "update", "unlock"]);
    expect(fixture.getMetadata()).toEqual({
      account_favorite_product_ids: ["prod_existing", "prod_added"], preference: "keep",
    });
  });

  it("uses a unique owner for each execution and releases only its own lock", async () => {
    const fixture = createWorkflowFixture();
    await updateCustomerFavoriteWorkflow(fixture.container).run({ input });
    await updateCustomerFavoriteWorkflow(fixture.container).run({ input });

    const owners = fixture.locking.acquire.mock.calls.map((call) => call[1]?.ownerId);
    expect(owners).toHaveLength(2);
    expect(owners.every((owner) => typeof owner === "string" && owner.length > 0)).toBe(true);
    expect(owners[0]).not.toBe(owners[1]);
    expect(fixture.locking.release.mock.calls.map((call) => call[1]?.ownerId)).toEqual(owners);
  });

  it("releases the lock and leaves favorites untouched when a product is unavailable", async () => {
    const fixture = createWorkflowFixture({ productAvailable: false });
    await expect(updateCustomerFavoriteWorkflow(fixture.container).run({ input })).rejects.toMatchObject({
      message: expect.stringContaining("no longer available"),
    });

    expect(fixture.updateCustomers).not.toHaveBeenCalled();
    expect(fixture.operations[fixture.operations.length - 1]).toBe("unlock");
    expect(fixture.locking.release.mock.calls[0][1]?.ownerId).toBe(
      fixture.locking.acquire.mock.calls[0][1]?.ownerId,
    );
  });

  it("restores favorites and releases the lock if a later workflow step fails", async () => {
    const fixture = createWorkflowFixture({ failEvent: true });
    await expect(updateCustomerFavoriteWorkflow(fixture.container).run({ input })).rejects.toMatchObject({
      message: "Event bus unavailable",
    });

    expect(fixture.getMetadata()).toEqual({
      account_favorite_product_ids: ["prod_existing"], preference: "keep",
    });
    expect(fixture.operations[fixture.operations.length - 1]).toBe("unlock");
  });

  it("removes the newly introduced metadata key when the first save is rolled back", async () => {
    const fixture = createWorkflowFixture({ failEvent: true, initialMetadata: { preference: "keep" } });
    await expect(updateCustomerFavoriteWorkflow(fixture.container).run({ input })).rejects.toMatchObject({
      message: "Event bus unavailable",
    });

    expect(fixture.getMetadata()).toEqual({ preference: "keep" });
    expect(fixture.operations[fixture.operations.length - 1]).toBe("unlock");
  });
});
