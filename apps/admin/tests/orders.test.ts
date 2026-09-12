import assert from "node:assert/strict";
import test from "node:test";
import Medusa from "@medusajs/js-sdk";
import type { HttpTypes } from "@medusajs/types";
import {
  listOrders,
  orderProductImages,
  ORDER_FIELDS,
} from "../src/features/orders/data";
import {
  logisticsLabel,
  orderDate,
  orderActionError,
  OrderValidationError,
  canComplete,
  canDeliver,
  money,
  orderListHref,
  parseOrderFilters,
  safeUrl,
  statusLabel,
} from "../src/features/orders/helpers";
import { operateOrder } from "../src/features/orders/operations";

function fixture(delivered = 2): HttpTypes.AdminOrder {
  return {
    id: "order_123",
    status: "pending",
    items: [
      {
        id: "item_1",
        quantity: 2,
        detail: {
          quantity: 2,
          fulfilled_quantity: 2,
          shipped_quantity: 2,
          delivered_quantity: delivered,
        },
      },
    ],
    fulfillments: [
      {
        id: "ful_123",
        shipped_at: "2026-09-12T12:00:00Z",
        delivered_at: delivered === 2 ? "2026-09-12T13:00:00Z" : null,
        canceled_at: null,
      },
    ],
  } as unknown as HttpTypes.AdminOrder;
}
function form(operation: string, confirmed = true) {
  const data = new FormData();
  data.set("order_id", "order_123");
  data.set("operation", operation);
  data.set("fulfillment_id", "ful_123");
  if (confirmed) data.set("confirmed", "yes");
  return data;
}
function sdkMock(order: HttpTypes.AdminOrder) {
  const calls: string[] = [];
  const sdk = {
    admin: {
      order: {
        retrieve: async () => {
          calls.push("read");
          return { order };
        },
        complete: async () => {
          calls.push("complete");
        },
        markAsDelivered: async () => {
          calls.push("deliver");
        },
        cancel: async () => {
          calls.push("cancel");
        },
      },
      payment: {
        capture: async () => {
          calls.push("capture");
        },
        refund: async () => {
          calls.push("refund");
        },
      },
    },
  } as unknown as Medusa;
  return { sdk, calls };
}
test("filters allow only native order states and bound pagination", () => {
  for (const status of ["shipped", "fulfilled", "delivered", "__proto__"])
    assert.equal(parseOrderFilters({ status }).status, "all");
  for (const offset of ["-1", "1.5", "Infinity", "1e3"])
    assert.equal(parseOrderFilters({ offset }).offset, 0);
  assert.equal(parseOrderFilters({ offset: "999999999" }).offset, 1_000_000);
  const filters = parseOrderFilters({ q: " A&B ", status: "pending" });
  const url = new URL(orderListHref(filters, 20), "https://admin.invalid");
  assert.equal(url.searchParams.get("q"), "A&B");
  assert.equal(url.searchParams.get("status"), "pending");
  assert.equal(url.searchParams.get("offset"), "20");
});
test("native SDK carries authentication and supported filters with explicit counters", async (t) => {
  const requests: { url: URL; init?: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), init });
      return Response.json({ orders: [], count: 85, limit: 20, offset: 20 });
    },
  );
  const sdk = new Medusa({
    baseUrl: "https://backend.invalid",
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
    globalHeaders: { Authorization: "Bearer test-only" },
  });
  const result = await listOrders(
    sdk,
    parseOrderFilters({ status: "pending", offset: "20", q: "order_123" }),
  );
  assert.equal(result.count, 85);
  assert.equal(requests[0].url.pathname, "/admin/orders");
  assert.equal(
    new Headers(requests[0].init?.headers).get("authorization"),
    "Bearer test-only",
  );
  assert.equal(requests[0].url.searchParams.get("offset"), "20");
  assert.equal(requests[0].url.searchParams.get("q"), "order_123");
  assert.equal(requests[0].url.searchParams.has("id"), false);
  assert.match(requests[0].url.search, /pending/);
  assert.equal(requests[0].url.searchParams.has("fulfillment_status"), false);
  for (const field of [
    "quantity",
    "fulfilled_quantity",
    "shipped_quantity",
    "delivered_quantity",
  ])
    assert.ok(ORDER_FIELDS.split(",").includes(`items.detail.${field}`));
});
test("completion fails closed for partial delivery, missing counters and inactive orders", () => {
  assert.equal(canComplete(fixture()), true);
  assert.equal(canComplete(fixture(1)), false);
  for (const status of [
    "completed",
    "canceled",
    "archived",
    "requires_action",
  ] as const)
    assert.equal(canComplete({ ...fixture(), status }), false);
  const missing = fixture();
  delete (missing.items[0] as Partial<HttpTypes.AdminOrderLineItem>).detail;
  assert.equal(canComplete(missing), false);
  assert.equal(canComplete({ ...fixture(), items: [] }), false);
  assert.equal(canComplete({ ...fixture(), fulfillments: undefined }), false);
});
test("delivery requires a shipped active fulfillment belonging to the pending order", () => {
  assert.equal(canDeliver(fixture(0), "ful_123"), true);
  assert.equal(canDeliver(fixture(), "ful_123"), false);
  assert.equal(canDeliver(fixture(0), "ful_other"), false);
  const order = fixture(0);
  order.fulfillments![0].canceled_at = new Date("2026-09-12T14:00:00Z");
  assert.equal(canDeliver(order, "ful_123"), false);
});
test("operations re-read state and reject stale completion before mutation", async () => {
  const valid = sdkMock(fixture());
  await operateOrder(valid.sdk, form("complete"));
  assert.deepEqual(valid.calls, ["read", "complete"]);
  const stale = sdkMock(fixture(1));
  await assert.rejects(operateOrder(stale.sdk, form("complete")), /entregados/);
  assert.deepEqual(stale.calls, ["read"]);
  const delivery = sdkMock(fixture(0));
  await operateOrder(delivery.sdk, form("deliver"));
  assert.deepEqual(delivery.calls, ["read", "deliver"]);
  const delivered = sdkMock(fixture());
  await assert.rejects(
    operateOrder(delivered.sdk, form("deliver")),
    /pendiente/,
  );
  assert.deepEqual(delivered.calls, ["read"]);
});
test("confirmation and identifiers are required and financial operations never execute", async () => {
  const { sdk, calls } = sdkMock(fixture());
  await assert.rejects(operateOrder(sdk, form("complete", false)), /Confirma/);
  for (const action of ["cancel", "capture", "refund", "payout"])
    await assert.rejects(operateOrder(sdk, form(action)), /no disponible/);
  const invalid = form("complete");
  invalid.set("order_id", "../admin/orders");
  await assert.rejects(operateOrder(sdk, invalid), /inválido/);
  assert.deepEqual(calls, []);
});
test("read failures stop mutations and surface instead of fabricating state", async () => {
  const { sdk, calls } = sdkMock(fixture());
  sdk.admin.order.retrieve = async () => {
    throw new Error("Unavailable");
  };
  await assert.rejects(operateOrder(sdk, form("complete")), /Unavailable/);
  assert.deepEqual(calls, []);
});
test("amounts remain in display units and tracking rejects executable URLs", () => {
  assert.match(money(49.99, "USD"), /49[,.]99/);
  assert.equal(statusLabel("partially_shipped"), "Enviado parcialmente");
  assert.equal(statusLabel("unrecognized"), "unrecognized");
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("https://user:secret@example.com"), null);
  assert.equal(
    safeUrl("https://tracking.example/123"),
    "https://tracking.example/123",
  );
});

test("logistics uses the lowest fully completed stage across items", () => {
  assert.equal(logisticsLabel(fixture()), "Entregado");
  assert.equal(logisticsLabel(fixture(1)), "Enviado");
  const order = fixture(0);
  order.items[0].detail.shipped_quantity = 1;
  assert.equal(logisticsLabel(order), "Preparado");
  order.items[0].detail.fulfilled_quantity = 1;
  assert.equal(logisticsLabel(order), "Pendiente de preparación");
  assert.equal(logisticsLabel({ ...order, items: [] }), "Sin informar");
});
test("order dates preserve explicit instants and reject missing or impossible dates", () => {
  assert.equal(orderDate(undefined), "Sin informar");
  assert.equal(orderDate("2026-02-30T12:00:00Z"), "Sin informar");
  assert.equal(orderDate("2026-09-12"), "Sin informar");
  assert.equal(
    orderDate("2026-09-12T00:30:00Z"),
    orderDate("2026-09-11T21:30:00-03:00"),
  );
  const date = new Date("2024-02-29T12:00:00Z");
  const timestamp = date.getTime();
  assert.notEqual(orderDate(date), "Sin informar");
  assert.equal(date.getTime(), timestamp);
});
test("only deliberate validation errors are exposed to the operator", () => {
  assert.equal(
    orderActionError(new OrderValidationError("Confirma la operación.")),
    "Confirma la operación.",
  );
  assert.doesNotMatch(
    orderActionError(new Error("secret transport credentials")),
    /secret|credentials/,
  );
});

test("missing snapshot images use one deduplicated product read and preserve orders", async () => {
  const order = fixture();
  order.items[0].product_id = "prod_123";
  const calls: unknown[] = [];
  const sdk = {
    admin: {
      product: {
        list: async (query: unknown) => {
          calls.push(query);
          return {
            products: [
              {
                id: "prod_123",
                thumbnail: null,
                images: [{ url: "https://images.example/item.jpg" }],
              },
            ],
          };
        },
      },
    },
  } as unknown as Medusa;
  const images = await orderProductImages(sdk, [order, order]);
  assert.equal(images.get("prod_123"), "https://images.example/item.jpg");
  assert.deepEqual(calls, [
    { id: ["prod_123"], fields: "id,thumbnail,images.url", limit: 1 },
  ]);
  assert.equal(order.items[0].thumbnail, undefined);
  sdk.admin.product.list = async () => {
    throw new Error("Unavailable");
  };
  assert.equal((await orderProductImages(sdk, [order])).size, 0);
});

import {
  financePayload,
  financeRequest,
} from "../src/features/orders/finance-form";

test("finance retries retain the same request identity until the submitted payload changes", () => {
  const data = new FormData();
  data.set("action", "refund");
  data.set("amount", "49.99");
  data.set("note", "Producto defectuoso");
  data.set("confirm", "yes");
  let sequence = 0;
  const createId = () => `request-${++sequence}`;
  const first = financeRequest(data, null, createId);
  assert.equal(financeRequest(data, first, createId), first);
  data.set("note", " Producto defectuoso ");
  assert.equal(financeRequest(data, first, createId), first);
  data.set("amount", "49.990");
  assert.equal(financeRequest(data, first, createId), first);
  data.set("amount", "12.50");
  const changed = financeRequest(data, first, createId);
  assert.notEqual(changed.id, first.id);
  assert.equal(financeRequest(data, changed, createId), changed);
  assert.notEqual(financeRequest(data, null, createId).id, changed.id);
});

test("finance payload preserves display units and requires note, UUID and confirmation", () => {
  const data = new FormData();
  data.set("action", "refund");
  data.set("amount", "49.99");
  data.set("note", " Motivo válido ");
  data.set("confirm", "yes");
  data.set("request_id", "12345678-1234-4123-8123-123456789012");
  assert.equal(financePayload(data).amount, 49.99);
  assert.equal(financePayload(data).note, "Motivo válido");
  for (const amount of ["", "0", "-1", "NaN", "Infinity"]) {
    data.set("amount", amount);
    assert.throws(() => financePayload(data), /importe/);
  }
  data.set("action", "cancel");
  assert.equal(Object.hasOwn(financePayload(data), "amount"), false);
  data.delete("confirm");
  assert.throws(() => financePayload(data), /Confirma/);
  data.set("confirm", "yes");
  data.set("note", "  ");
  assert.throws(() => financePayload(data), /motivo/);
  data.set("note", "Motivo válido");
  data.set("request_id", "invalid");
  assert.throws(() => financePayload(data), /solicitud/);
  data.set("action", "payout");
  assert.throws(() => financePayload(data), /disponible/);
});

test("operator capture omits client amounts and keeps its UUID across identical retries", () => {
  const data = new FormData();
  data.set("action", "capture");
  data.set("note", "Cobro de compra autorizado");
  data.set("confirm", "yes");
  const requestId = "12345678-1234-4123-8123-123456789012";
  data.set("request_id", requestId);
  const first = financeRequest(data, null, () => requestId);
  assert.deepEqual(financePayload(data), {
    action: "capture",
    note: "Cobro de compra autorizado",
    confirm: true,
    request_id: requestId,
  });
  data.set("amount", "999999");
  assert.equal(Object.hasOwn(financePayload(data), "amount"), false);
  assert.equal(
    financeRequest(data, first, () => "unexpected"),
    first,
  );
  data.set("note", "Otro motivo de cobro");
  assert.notEqual(financeRequest(data, first, () => "changed").id, first.id);
  data.delete("confirm");
  assert.throws(() => financePayload(data), /Confirma/);
  data.set("confirm", "yes");
  data.set("request_id", "invalid");
  assert.throws(() => financePayload(data), /solicitud/);
  data.set("request_id", requestId);
  data.set("note", "  ");
  assert.throws(() => financePayload(data), /motivo/);
});

import type { OrderFinanceResponse } from "@marketplace-v2/api/finance-contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderFinanceHistory } from "../src/features/orders/finance-history";

function renderFinanceHistory(
  history: OrderFinanceResponse["finance"]["history"],
) {
  return renderToStaticMarkup(
    createElement(OrderFinanceHistory, {
      finance: {
        order_id: "order_123",
        currency_code: "usd",
        allocated_total: 100,
        captured_total: 75,
        refunded_total: 25,
        refundable_total: 50,
        capture: { allowed: false, reason: "Ya cobrado", amount: 0 },
        cancellation: {
          allowed: false,
          reason: "No disponible",
          refund_amount: 0,
        },
        refund: { allowed: true, reason: null },
        history,
      },
    }),
  );
}

test("finance history labels captures and shows only reported reversal amounts in display units", () => {
  const entry: OrderFinanceResponse["finance"]["history"][number] = {
    id: "operation_123",
    kind: "capture",
    amount: 75,
    status: "complete",
    note: "Cobro autorizado",
    created_at: "2026-09-12T12:00:00Z",
  };
  const capture = renderFinanceHistory([entry]);
  assert.match(capture, /Cobro/);
  assert.doesNotMatch(capture, /Recuperado del vendedor|Comisión devuelta/);
  const reversal = renderFinanceHistory([
    {
      ...entry,
      kind: "refund",
      amount: 25,
      seller_reversed: 21.25,
      commission_returned: 3.75,
    },
  ]);
  assert.match(reversal, /Reembolso/);
  assert.match(reversal, /Recuperado del vendedor:.*21[,.]25/);
  assert.match(reversal, /Comisión devuelta por el marketplace:.*3[,.]75/);
  const zero = renderFinanceHistory([
    { ...entry, kind: "cancel", seller_reversed: 0 },
  ]);
  assert.match(zero, /Recuperado del vendedor:.*0[,.]00/);
  assert.doesNotMatch(zero, /Comisión devuelta/);
  assert.match(
    renderFinanceHistory([]),
    /Sin operaciones financieras registradas/,
  );
});
