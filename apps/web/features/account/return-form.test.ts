import assert from "node:assert/strict";
import { test } from "node:test";
import { returnPayload, returnRequest } from "./return-form";

function form() {
  const result = new FormData();
  result.set("request_id", "755f0a82-7cf6-4195-b833-825c955918dc");
  result.set("reason", "damaged");
  result.set("note", "El producto llegó dañado");
  result.set("quantity:item_one", "1");
  result.set("quantity:item_two", "0");
  result.set("confirm", "yes");
  return result;
}

test("only selected quantities enter the customer return request", () => {
  assert.deepEqual(returnPayload(form()), {
    request_id: "755f0a82-7cf6-4195-b833-825c955918dc",
    reason: "damaged",
    note: "El producto llegó dañado",
    items: [{ id: "item_one", quantity: 1 }],
    confirm: true,
  });
});

test("customer requests reject unselected, fractional, invalid and repeated quantities", () => {
  for (const quantity of ["0", "-1", "0.5", "NaN", "1000"]) {
    const input = form();
    input.set("quantity:item_one", quantity);
    assert.throws(() => returnPayload(input));
  }
  const duplicate = form();
  duplicate.append("quantity:item_one", "1");
  assert.throws(() => returnPayload(duplicate), /sin repetirlos/);
});

test("physical returns allow only product damage or wrong products with confirmation", () => {
  const input = form();
  input.set("reason", "changed_mind");
  assert.throws(() => returnPayload(input), /motivo/);
  input.set("reason", "wrong_item");
  input.delete("confirm");
  assert.throws(() => returnPayload(input), /Confirma la solicitud/);
});

test("return retries keep identity across field order and whitespace but not material changes", () => {
  const input = form();
  input.set("quantity:item_two", "2");
  const original = returnRequest(input, null, () => "original");
  const retry = form();
  retry.delete("quantity:item_one");
  retry.set("quantity:item_two", "2");
  retry.set("quantity:item_one", "1");
  retry.set("note", "  El producto llegó dañado  ");
  assert.equal(
    returnRequest(retry, original, () => "unused"),
    original,
  );
  retry.set("quantity:item_two", "1");
  assert.equal(
    returnRequest(retry, original, () => "new_request").id,
    "new_request",
  );
});
