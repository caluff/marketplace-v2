import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { asValue } from "@medusajs/framework/awilix";
import type { MedusaContainer } from "@medusajs/framework/types";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { addToCartWorkflow } from "@medusajs/medusa/core-flows";
import "@mercurjs/core/workflows/cart/hooks/index";
import "../hooks/stripe-sale-readiness";
import "../hooks/vendor-offer-validation";

type Item = { id?: string; quantity: number; offer_id?: string; offer?: { id: string }; metadata?: Record<string, unknown> };
type GraphInput = { entity: string; fields: string[]; filters: Record<string, unknown> };
type Validate = (data: { input: { items: Item[] }; cart: { id: string; sales_channel_id: string } }, context: { container: MedusaContainer }) => Promise<void>;
type ValidateUpdate = (data: { input: { item_id: string; update: { quantity: number } }; cart: { id: string; sales_channel_id: string; items: Item[] } }, context: { container: MedusaContainer }) => Promise<void>;

const coreRoot = path.dirname(require.resolve("@mercurjs/core/package.json"));
const hookPath = path.join(coreRoot, ".medusa/server/src/workflows/cart/hooks/validate.js");
const nativeRequire = createRequire(hookPath);
let validate: Validate;
let validateUpdate: ValidateUpdate;
runInNewContext(readFileSync(hookPath, "utf8"), {
  exports: {},
  require: (id: string) => id === "@medusajs/medusa/core-flows"
    ? {
      addToCartWorkflow: { hooks: { validate: (callback: Validate) => { validate = callback; } } },
      updateLineItemInCartWorkflow: { hooks: { validate: (callback: ValidateUpdate) => { validateUpdate = callback; } } },
    }
    : nativeRequire(id),
});

function fixture(existingItems: Item[] = [{ quantity: 12, offer: { id: "offer_a" } }], options: { manageInventory?: boolean; allowBackorder?: boolean; requiredQuantity?: number } = {}) {
  const offer = {
    id: "offer_a",
    manage_inventory: options.manageInventory ?? true,
    allow_backorder: options.allowBackorder ?? false,
    inventory_item_link: [{
      required_quantity: options.requiredQuantity ?? 1,
      inventory_item: {
        id: "inventory_a",
        location_levels: [{ location_id: "location_a", stocked_quantity: 20, reserved_quantity: 0 }],
      },
    }],
  };
  let locked = false;
  const graph = jest.fn(async ({ entity, filters }: GraphInput) => {
    if (entity === "cart") return { data: [{ id: "cart_a", sales_channel_id: "sc_a", completed_at: null, currency_code: "usd" }] };
    if (entity === "offer") return { data: [offer] };
    if (entity === "line_item") {
      expect(filters).toEqual({ cart_id: "cart_a" });
      return { data: existingItems };
    }
    throw new Error(`Unexpected query: ${entity}`);
  });
  const confirmInventory = jest.fn(async (_id: string, _locations: string[], quantity: unknown) => Number(quantity) <= 20);
  const createLineItems = jest.fn();
  const updateLineItems = jest.fn();
  const acquire = jest.fn(async () => { locked = true; });
  const release = jest.fn(async () => { locked = false; return true; });
  const container = createMedusaContainer();
  container.register({
    query: asValue({ graph }),
    inventory: asValue({ confirmInventory }),
    cart: asValue({ createLineItems, updateLineItems }),
    locking: asValue({ acquire, release }),
    logger: asValue({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }),
  });
  return { container, graph, confirmInventory, createLineItems, updateLineItems, acquire, release, isLocked: () => locked };
}

function check(container: MedusaContainer, quantities: number[]) {
  return validate({
    input: { items: quantities.map((quantity) => ({ quantity, offer_id: "offer_a" })) },
    // This matches Medusa's real pricing-context projection: there are no items.
    cart: { id: "cart_a", sales_channel_id: "sc_a" },
  }, { container });
}

it("rejects adding 20 units to the existing 12 when available stock is 20", async () => {
  const { container, confirmInventory } = fixture();
  await expect(check(container, [20])).rejects.toMatchObject({ code: "insufficient_inventory" });
  expect(Number(confirmInventory.mock.calls[0][2])).toBe(32);
  expect(confirmInventory).toHaveBeenCalledTimes(1);
});

it("accepts the remaining 8 units and checks the resulting total once", async () => {
  const { container, confirmInventory, graph } = fixture();
  await expect(check(container, [8])).resolves.toBeUndefined();
  expect(Number(confirmInventory.mock.calls[0][2])).toBe(20);
  expect(graph).toHaveBeenCalledTimes(2);
});

it.each([[4, 5], [8, 8]])("aggregates duplicate incoming offer lines %j before checking stock", async (...quantities) => {
  const { container, confirmInventory } = fixture();
  await expect(check(container, quantities)).rejects.toMatchObject({ code: "insufficient_inventory" });
  expect(confirmInventory).toHaveBeenCalledTimes(1);
  expect(Number(confirmInventory.mock.calls[0][2])).toBe(12 + quantities.reduce((sum, quantity) => sum + quantity, 0));
});

it("aggregates existing lines across metadata and prefers the authoritative offer link", async () => {
  const { container, confirmInventory } = fixture([
    { quantity: 7, offer: { id: "offer_a" }, metadata: { offer_id: "offer_other" } },
    { quantity: 5, metadata: { offer_id: "offer_a" } },
    { quantity: 99, offer: { id: "offer_other" }, metadata: { offer_id: "offer_a" } },
  ]);
  await expect(check(container, [8])).resolves.toBeUndefined();
  expect(Number(confirmInventory.mock.calls[0][2])).toBe(20);
});

it("preserves inventory component multipliers", async () => {
  const { container, confirmInventory } = fixture([{ quantity: 5, offer: { id: "offer_a" } }], { requiredQuantity: 2 });
  await expect(check(container, [6])).rejects.toMatchObject({ code: "insufficient_inventory" });
  expect(Number(confirmInventory.mock.calls[0][2])).toBe(22);
});

it.each([{ manageInventory: false }, { allowBackorder: true }])("preserves the native unmanaged/backorder policy %j", async (options) => {
  const { container, confirmInventory } = fixture(undefined, options);
  await expect(check(container, [20])).resolves.toBeUndefined();
  expect(confirmInventory).not.toHaveBeenCalled();
});

it("rejects through the real native workflow with Mercur and application hooks loaded, releasing the lock before any cart writes", async () => {
  const state = fixture();
  await expect(addToCartWorkflow(state.container).run({ input: {
    cart_id: "cart_a",
    items: [{ variant_id: "variant_a", quantity: 20, metadata: { offer_id: "offer_a" }, offer_id: "offer_a" }],
  } as never })).rejects.toMatchObject({ code: "insufficient_inventory" });
  expect(state.acquire).toHaveBeenCalledTimes(1);
  expect(state.release).toHaveBeenCalledTimes(1);
  expect(state.isLocked()).toBe(false);
  expect(state.createLineItems).not.toHaveBeenCalled();
  expect(state.updateLineItems).not.toHaveBeenCalled();
});

const updateItems: Item[] = [
  { id: "line_other", quantity: 12, offer: { id: "offer_a" } },
  { id: "line_target", quantity: 8, offer: { id: "offer_a" } },
  { id: "line_unrelated", quantity: 99, offer: { id: "offer_other" } },
];

function checkUpdate(container: MedusaContainer, quantity: number) {
  return validateUpdate({
    input: { item_id: "line_target", update: { quantity } },
    cart: { id: "cart_a", sales_channel_id: "sc_a", items: updateItems },
  }, { container });
}

it("rejects updating a line to 9 when another line of the same offer already holds 12 of 20 available units", async () => {
  const { container, confirmInventory } = fixture(updateItems);
  await expect(checkUpdate(container, 9)).rejects.toMatchObject({ code: "insufficient_inventory" });
  expect(Number(confirmInventory.mock.calls[0][2])).toBe(21);
});

it("accepts the absolute target quantity of 8 without counting its previous 8 units twice", async () => {
  const { container, confirmInventory, graph } = fixture(updateItems);
  await expect(checkUpdate(container, 8)).resolves.toBeUndefined();
  expect(Number(confirmInventory.mock.calls[0][2])).toBe(20);
  expect(confirmInventory).toHaveBeenCalledTimes(1);
  expect(graph).toHaveBeenCalledTimes(2);
});

it("preserves the native zero-quantity removal fast path without querying stock", async () => {
  const { container, confirmInventory, graph } = fixture(updateItems);
  await expect(checkUpdate(container, 0)).resolves.toBeUndefined();
  expect(confirmInventory).not.toHaveBeenCalled();
  expect(graph).not.toHaveBeenCalled();
});
