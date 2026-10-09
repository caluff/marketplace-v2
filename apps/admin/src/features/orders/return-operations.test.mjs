import assert from "node:assert/strict";
import { test } from "node:test";
import {
  operateReturn,
  returnQuantities,
  availableReturnQuantity,
  returnPanelRecord,
} from "./return-operations.ts";

function scenario({ recordOverrides = {}, changeOverrides = {} } = {}) {
  const calls = [];
  const record = {
    id: "return_test",
    order_id: "order_test",
    display_id: 1,
    status: "requested",
    location_id: "sloc_test",
    requested_at: "2026-10-07T12:00:00Z",
    items: [
      {
        id: "retitem_test",
        item_id: "orli_test",
        quantity: 3,
        received_quantity: 1,
        damaged_quantity: 0,
      },
    ],
    ...recordOverrides,
  };
  const change = {
    id: "orch_test",
    order_id: "order_test",
    return_id: "return_test",
    status: "pending",
    actions: [],
    ...changeOverrides,
  };
  function mutation(method) {
    return async (...args) => {
      calls.push({ method, args });
      return { return: record };
    };
  }
  const client = {
    initiateRequest: mutation("initiateRequest"),
    addReturnItem: mutation("addReturnItem"),
    updateRequest: mutation("updateRequest"),
    confirmRequest: mutation("confirmRequest"),
    cancelRequest: mutation("cancelRequest"),
    cancel: mutation("cancel"),
    initiateReceive: mutation("initiateReceive"),
    receiveItems: mutation("receiveItems"),
    dismissItems: mutation("dismissItems"),
    confirmReceive: mutation("confirmReceive"),
    cancelReceive: mutation("cancelReceive"),
    retrieve: async () => ({ return: record }),
    changes: async () => ({ order_changes: [change] }),
  };
  const form = new FormData();
  form.set("order_id", "order_test");
  form.set("return_id", "return_test");
  form.set("operation", "stage_receive");
  return { client, form, calls, record };
}

test("return quantities reject invalid integers, unknown IDs and duplicate fields", () => {
  for (const value of ["-1", "0.5", "Infinity", "", "NaN"]) {
    const form = new FormData();
    form.set("quantity:orli_test", value);
    assert.throws(
      () => returnQuantities(form, "quantity"),
      /cantidades enteras válidas/,
    );
  }
  const duplicate = new FormData();
  duplicate.append("quantity:orli_test", "1");
  duplicate.append("quantity:orli_test", "1");
  assert.throws(
    () => returnQuantities(duplicate, "quantity"),
    /cantidades enteras válidas/,
  );
  const unknown = new FormData();
  unknown.set("quantity:return_test", "1");
  assert.throws(
    () => returnQuantities(unknown, "quantity"),
    /cantidades enteras válidas/,
  );
});

test("zero quantities are omitted from the native request", () => {
  const form = new FormData();
  form.set("quantity:orli_zero", "0");
  form.set("quantity:orli_test", "2");
  assert.deepEqual(returnQuantities(form, "quantity"), [
    { id: "orli_test", quantity: 2 },
  ]);
});

test("customer return metadata exposes only its reason and note to the panel", () => {
  const { record } = scenario({
    recordOverrides: {
      metadata: {
        secret_internal_data: "private",
        usapeek_customer_return: {
          reason: "wrong_item",
          note: "Recibí otro artículo.",
          fingerprint: "private",
          customer_id: "cus_private",
          request_id: "private",
        },
      },
    },
  });
  assert.deepEqual(returnPanelRecord(record).metadata, {
    usapeek_customer_return: {
      reason: "wrong_item",
      note: "Recibí otro artículo.",
    },
  });
});

test("good and damaged quantities share the same outstanding limit", async () => {
  const { client, form, calls } = scenario();
  form.set("received:orli_test", "2");
  form.set("damaged:orli_test", "1");
  await assert.rejects(
    operateReturn(client, form),
    /superan las unidades pendientes/,
  );
  assert.deepEqual(calls, []);
});

test("receival stages good stock and damaged stock through separate native operations", async () => {
  const { client, form, calls } = scenario();
  form.set("received:orli_test", "1");
  form.set("damaged:orli_test", "1");
  assert.equal(await operateReturn(client, form), "order_test");
  assert.deepEqual(calls, [
    {
      method: "receiveItems",
      args: ["return_test", { items: [{ id: "orli_test", quantity: 1 }] }],
    },
    {
      method: "dismissItems",
      args: ["return_test", { items: [{ id: "orli_test", quantity: 1 }] }],
    },
  ]);
});

test("an existing receival draft prevents duplicate staging after a partial network failure", async () => {
  const { client, form, calls } = scenario({
    changeOverrides: {
      actions: [
        {
          id: "orchact_test",
          action: "RECEIVE_RETURN_ITEM",
          details: { reference_id: "orli_test", quantity: 1 },
        },
      ],
    },
  });
  form.set("received:orli_test", "1");
  await assert.rejects(
    operateReturn(client, form),
    /tiene cantidades guardadas/,
  );
  assert.deepEqual(calls, []);
});

test("a return belonging to a different order cannot be mutated", async () => {
  const { client, form, calls } = scenario({
    recordOverrides: { order_id: "order_other" },
  });
  form.set("received:orli_test", "1");
  await assert.rejects(
    operateReturn(client, form),
    /no pertenece a este pedido/,
  );
  assert.deepEqual(calls, []);
});

test("approving a customer draft assigns its native destination before confirmation", async () => {
  const { client, form, calls } = scenario({
    recordOverrides: { requested_at: null, location_id: null },
    changeOverrides: {
      actions: [
        {
          id: "orchact_test",
          action: "RETURN_ITEM",
          details: { reference_id: "orli_test", quantity: 1 },
        },
      ],
    },
  });
  form.set("operation", "confirm_request");
  form.set("confirmed", "yes");
  form.set("location_id", "sloc_destination");
  await operateReturn(client, form);
  assert.deepEqual(calls, [
    {
      method: "updateRequest",
      args: ["return_test", { location_id: "sloc_destination" }],
    },
    { method: "confirmRequest", args: ["return_test", {}] },
  ]);
});

test("approving a draft requires confirmation and a physical destination", async () => {
  for (const confirmed of [false, true]) {
    const { client, form, calls } = scenario({
      recordOverrides: { requested_at: null, location_id: null },
      changeOverrides: {
        actions: [
          {
            id: "orchact_test",
            action: "RETURN_ITEM",
            details: { reference_id: "orli_test", quantity: 1 },
          },
        ],
      },
    });
    form.set("operation", "confirm_request");
    if (confirmed) form.set("confirmed", "yes");
    await assert.rejects(
      operateReturn(client, form),
      confirmed ? /registro no es válido/ : /Confirma la operación/,
    );
    assert.deepEqual(calls, []);
  }
});

test("only uncanceled returns reserve units for a later request", () => {
  const { record } = scenario();
  const canceled = { ...record, id: "return_canceled", status: "canceled" };
  assert.equal(
    availableReturnQuantity(
      {
        id: "orli_test",
        title: "Artículo",
        quantity: 5,
        detail: { fulfilled_quantity: 5 },
      },
      [record, canceled],
    ),
    2,
  );
});

test("creation checks positive quantities and note limits before creating native drafts", async () => {
  for (const note of ["", "x".repeat(1001)]) {
    const { client, form, calls } = scenario();
    form.set("operation", "create");
    form.set("location_id", "sloc_test");
    form.set("note", note);
    form.set("quantity:orli_test", note ? "1" : "0");
    await assert.rejects(
      operateReturn(client, form),
      note ? /1000 caracteres/ : /al menos una unidad/,
    );
    assert.deepEqual(calls, []);
  }
});

test("confirmed cancellation uses the native endpoint for an approved unreceived return", async () => {
  const { client, form, calls } = scenario({
    recordOverrides: {
      items: [
        {
          id: "retitem_test",
          item_id: "orli_test",
          quantity: 3,
          received_quantity: 0,
          damaged_quantity: 0,
        },
      ],
    },
    changeOverrides: { status: "confirmed" },
  });
  form.set("operation", "cancel_return");
  form.set("confirmed", "yes");
  await operateReturn(client, form);
  assert.deepEqual(calls, [{ method: "cancel", args: ["return_test"] }]);
});

test("approved return cancellation requires explicit confirmation and order ownership", async () => {
  for (const confirm of [false, true]) {
    const { client, form, calls } = scenario({
      recordOverrides: { order_id: "order_other" },
      changeOverrides: { status: "confirmed" },
    });
    form.set("operation", "cancel_return");
    if (confirm) form.set("confirmed", "yes");
    await assert.rejects(
      operateReturn(client, form),
      confirm ? /no pertenece a este pedido/ : /Confirma la operación/,
    );
    assert.deepEqual(calls, []);
  }
});

test("drafts, canceled returns and returns with good or damaged received units cannot be canceled as approved", async () => {
  const cases = [
    { requested_at: null },
    { canceled_at: "2026-10-07T14:00:00Z" },
    { status: "canceled" },
    { status: "received" },
    {
      items: [
        {
          id: "retitem_test",
          item_id: "orli_test",
          quantity: 3,
          received_quantity: 1,
          damaged_quantity: 0,
        },
      ],
    },
    {
      items: [
        {
          id: "retitem_test",
          item_id: "orli_test",
          quantity: 3,
          received_quantity: 0,
          damaged_quantity: 1,
        },
      ],
    },
  ];
  for (const recordOverrides of cases) {
    const { client, form, calls } = scenario({
      recordOverrides,
      changeOverrides: { status: "confirmed" },
    });
    form.set("operation", "cancel_return");
    form.set("confirmed", "yes");
    await assert.rejects(
      operateReturn(client, form),
      /Solo se puede cancelar una devolución aprobada/,
    );
    assert.deepEqual(calls, []);
  }
});

test("an active receipt or a different order change must be resolved before native return cancellation", async () => {
  for (const returnId of ["return_test", "return_other"]) {
    const { client, form, calls } = scenario({
      recordOverrides: {
        items: [
          {
            id: "retitem_test",
            item_id: "orli_test",
            quantity: 3,
            received_quantity: 0,
            damaged_quantity: 0,
          },
        ],
      },
      changeOverrides: { return_id: returnId },
    });
    form.set("operation", "cancel_return");
    form.set("confirmed", "yes");
    await assert.rejects(operateReturn(client, form), /sin recepción iniciada/);
    assert.deepEqual(calls, []);
  }
});

test("return availability is limited to fulfilled units and subtracts outstanding plus finished returns", () => {
  const item = {
    id: "orli_test",
    title: "Artículo",
    quantity: 10,
    detail: {
      fulfilled_quantity: 6,
      return_requested_quantity: 1,
      return_received_quantity: 2,
      return_dismissed_quantity: 1,
    },
  };
  assert.equal(availableReturnQuantity(item, []), 2);
  assert.equal(availableReturnQuantity({ ...item, quantity: 5 }, []), 1);
  assert.equal(availableReturnQuantity({ ...item, detail: undefined }, []), 0);
  const { record } = scenario({
    recordOverrides: {
      status: "received",
      items: [
        {
          id: "retitem_test",
          item_id: "orli_test",
          quantity: 6,
          received_quantity: 6,
          damaged_quantity: 0,
        },
      ],
    },
  });
  assert.equal(availableReturnQuantity(item, [record]), 0);
});
