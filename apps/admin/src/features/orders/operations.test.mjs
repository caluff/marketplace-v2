import assert from "node:assert/strict";
import { test } from "node:test";
import { operateOrder } from "./operations.ts";

function scenario(overrides = {}) {
  const canceled = [];
  const sdk = {
    admin: {
      order: {
        retrieve: async () => ({
          order: {
            id: "order_test",
            status: "pending",
            fulfillments: [
              {
                id: "ful_test",
                canceled_at: null,
                shipped_at: null,
                delivered_at: null,
                ...overrides,
              },
            ],
          },
        }),
        cancelFulfillment: async (...args) => canceled.push(args),
      },
    },
  };
  const form = new FormData();
  form.set("order_id", "order_test");
  form.set("operation", "cancel_fulfillment");
  form.set("fulfillment_id", "ful_test");
  form.set("confirmed", "yes");
  return { sdk, form, canceled };
}

test("admin cancels an unshipped preparation through the installed SDK", async () => {
  const { sdk, form, canceled } = scenario();
  assert.equal(await operateOrder(sdk, form), "order_test");
  assert.deepEqual(canceled, [["order_test", "ful_test", {}]]);
});

test("admin rechecks preparation ownership and terminal shipment states before cancellation", async () => {
  for (const overrides of [
    { id: "ful_other" },
    { canceled_at: "2026-10-07T12:00:00Z" },
    { shipped_at: "2026-10-07T12:00:00Z" },
    { delivered_at: "2026-10-07T12:00:00Z" },
  ]) {
    const { sdk, form, canceled } = scenario(overrides);
    await assert.rejects(
      operateOrder(sdk, form),
      /La preparación ya no se puede cancelar/,
    );
    assert.deepEqual(canceled, []);
  }
});

test("canceling preparation requires explicit confirmation", async () => {
  const { sdk, form, canceled } = scenario();
  form.delete("confirmed");
  await assert.rejects(operateOrder(sdk, form), /Confirma la operación/);
  assert.deepEqual(canceled, []);
});
