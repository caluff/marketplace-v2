import assert from "node:assert/strict";
import { test } from "node:test";
import { logisticsStatus } from "./logistics-status.ts";

function item(fulfilled = 0, shipped = 0, delivered = 0) {
  return {
    detail: {
      quantity: 2,
      fulfilled_quantity: fulfilled,
      shipped_quantity: shipped,
      delivered_quantity: delivered,
    },
  };
}

test("cancellation takes precedence over delivery counters", () => {
  assert.equal(
    logisticsStatus({ status: "canceled", items: [item(2, 2, 2)] }),
    "canceled",
  );
});

test("requires complete quantities across every item before showing each completed stage", () => {
  for (const [items, expected] of [
    [[item(), item()], "not_fulfilled"],
    [[item(2), item(2)], "fulfilled"],
    [[item(2, 2), item(2, 2)], "shipped"],
    [[item(2, 2, 2), item(2, 2, 2)], "delivered"],
  ]) {
    assert.equal(logisticsStatus({ status: "pending", items }), expected);
  }
});

test("a single delivered or shipped item does not imply the entire order reached that stage", () => {
  assert.equal(
    logisticsStatus({ status: "pending", items: [item(2, 2, 2), item(2)] }),
    "fulfilled",
  );
  assert.equal(
    logisticsStatus({ status: "pending", items: [item(2, 2), item()] }),
    "not_fulfilled",
  );
});

test("missing counters and items keep an unknown state", () => {
  for (const items of [undefined, [], [{}]]) {
    assert.equal(logisticsStatus({ status: "pending", items }), undefined);
  }
});

test("invalid quantities never claim preparation, shipping or delivery", () => {
  for (const field of [
    "quantity",
    "fulfilled_quantity",
    "shipped_quantity",
    "delivered_quantity",
  ]) {
    for (const value of [-1, 0.5, NaN, Infinity, undefined]) {
      const invalid = item(2, 2, 2);
      invalid.detail[field] = value;
      assert.equal(
        logisticsStatus({ status: "pending", items: [invalid] }),
        undefined,
      );
    }
  }
  assert.equal(
    logisticsStatus({ status: "pending", items: [item(3, 2, 2)] }),
    undefined,
  );
});
