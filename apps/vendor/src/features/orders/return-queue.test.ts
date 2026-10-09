import assert from "node:assert/strict";
import { test } from "node:test";
import {
  returnQueueInput,
  returnQueueQuery,
  returnQueueReason,
  returnQueueStatus,
} from "./return-queue";

test("the pending queue includes native open drafts and excludes finished returns", () => {
  const query = returnQueueQuery(returnQueueInput({ offset: "20" }));
  assert.deepEqual(query.status, ["open", "requested", "partially_received"]);
  assert.equal(query.limit, 10);
  assert.equal(query.offset, 20);
  assert.equal(query.order, "-created_at");
});

test("pending queue route inputs cannot produce malformed native pagination", () => {
  for (const offset of ["NaN", "-10", "1.5", ["10", "20"], undefined]) {
    assert.equal(returnQueueQuery(returnQueueInput({ offset })).offset, 0);
  }
  assert.equal(returnQueueQuery(returnQueueInput({ offset: "15" })).offset, 10);
});

test("customer requests remain discoverable with only safe reason and note details", () => {
  const record = {
    id: "return_test",
    order_id: "order_test",
    display_id: 1,
    requested_at: null,
    created_at: "2026-10-07T12:00:00Z",
    metadata: {
      usapeek_customer_return: {
        reason: "damaged",
        note: "El artículo llegó roto.",
        customer_id: "cus_private",
        fingerprint: "private",
      },
    },
  };
  assert.equal(returnQueueStatus(record), "Solicitud pendiente");
  assert.deepEqual(returnQueueReason(record), {
    origin: "Cliente",
    reason: "Artículo dañado",
    note: "El artículo llegó roto.",
  });
  assert.equal(
    returnQueueStatus({
      ...record,
      requested_at: "2026-10-07T13:00:00Z",
      status: "partially_received",
    }),
    "Recibida parcialmente",
  );
  assert.equal(
    returnQueueReason({ ...record, metadata: undefined }).origin,
    "Tienda / operador",
  );
});
