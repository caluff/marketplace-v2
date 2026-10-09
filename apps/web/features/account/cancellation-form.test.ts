import assert from "node:assert/strict";
import { test } from "node:test";
import { cancellationPayload, cancellationRequest } from "./cancellation-form";

test("buyer cancellation exposes only the cancel-only body", () => {
  const form = new FormData();
  form.set("note", "  Ya no necesito el producto  ");
  form.set("confirm", "yes");
  form.set("request_id", "755f0a82-7cf6-4195-b833-825c955918dc");
  form.set("action", "capture");
  form.set("amount", "100");
  assert.deepEqual(cancellationPayload(form), {
    note: "Ya no necesito el producto",
    confirm: true,
    request_id: "755f0a82-7cf6-4195-b833-825c955918dc",
  });
  form.delete("confirm");
  assert.throws(() => cancellationPayload(form), /Confirma la cancelación/);
});

test("transport retries retain their request identity while a changed reason gets a new request", () => {
  const original = cancellationRequest(
    "Cambio de planes",
    null,
    () => "request_original",
  );
  assert.equal(
    cancellationRequest("  Cambio de planes  ", original, () => "unused"),
    original,
  );
  assert.deepEqual(
    cancellationRequest("Otro motivo", original, () => "request_new"),
    { note: "Otro motivo", id: "request_new" },
  );
});
