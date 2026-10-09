import assert from "node:assert/strict";
import { test } from "node:test";
import { availableFinanceOperations } from "./finance-form.ts";

function finance(capture, refund, cancellation) {
  return {
    capture: { allowed: capture, reason: null, amount: 25 },
    refund: { allowed: refund, reason: null },
    cancellation: { allowed: cancellation, reason: null, refund_amount: 25 },
  };
}

test("a settled cancellation offers no further financial operations", () => {
  assert.deepEqual(
    availableFinanceOperations(finance(false, false, false)),
    [],
  );
});

test("an available refund remains accessible when cancellation is forbidden", () => {
  assert.deepEqual(availableFinanceOperations(finance(false, true, false)), [
    { value: "refund", label: "Reembolsar" },
  ]);
});

test("operations follow refreshed server permissions without retaining a forbidden choice", () => {
  assert.deepEqual(
    availableFinanceOperations(finance(true, false, true)).map(
      ({ value }) => value,
    ),
    ["capture", "cancel"],
  );
  assert.deepEqual(
    availableFinanceOperations(finance(false, true, true)).map(
      ({ value }) => value,
    ),
    ["refund", "cancel"],
  );
  assert.deepEqual(
    availableFinanceOperations(finance(false, false, true)).map(
      ({ value }) => value,
    ),
    ["cancel"],
  );
});
