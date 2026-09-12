import assert from "node:assert/strict";
import { test } from "node:test";
import Medusa, { FetchError } from "@medusajs/js-sdk";
import type { OrderDetailDTO } from "@medusajs/types";
import type { SellerMemberDTO } from "@mercurjs/types";
import {
  orderCapabilities,
  orderOperations,
  preparationIssue,
  remainingToPrepare,
} from "./operations";
import { sellerWarehouse } from "../inventory/data";
import { ORDER_TABS, orderListInput } from "./parameters";
import { getOrderDisplayStatus } from "./status";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { PassThrough } from "node:stream";
import { createElement, type ReactNode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import ts from "typescript";

function fixture(overrides: Partial<OrderDetailDTO> = {}) {
  return {
    id: "order_1",
    status: "pending",
    items: [
      {
        id: "item_1",
        quantity: 3,
        requires_shipping: true,
        detail: {
          fulfilled_quantity: 1,
          shipped_quantity: 0,
          delivered_quantity: 0,
        },
      },
    ],
    fulfillments: [
      {
        id: "ful_1",
        items: [{ id: "fi_1", line_item_id: "item_1", quantity: 1 }],
      },
    ],
    ...overrides,
  } as OrderDetailDTO;
}
function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries({ order_id: "order_1", ...values }).forEach(([key, value]) =>
    data.set(key, value),
  );
  return data;
}
const approvedWarehouse = {
  stock_location: {
    id: "loc_approved",
    name: "Almacén aprobado",
    address: {
      address_1: "123 Main St",
      city: "Miami",
      postal_code: "33101",
      country_code: "us",
    },
  },
};

function harness(
  order = fixture(),
  active = true,
  warehouse: unknown = approvedWarehouse,
) {
  const calls: {
    path: string;
    init: Parameters<Medusa["client"]["fetch"]>[1];
  }[] = [];
  let authorizations = 0;
  const sdk = new Medusa({
    baseUrl: "https://api.example.invalid",
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
  });
  sdk.client.fetch = async <T>(
    path: Parameters<Medusa["client"]["fetch"]>[0],
    init?: Parameters<Medusa["client"]["fetch"]>[1],
  ) => {
    calls.push({ path: String(path), init });
    if (path === "/vendor/warehouse") {
      if (warehouse instanceof Error) throw warehouse;
      return warehouse as T;
    }
    return { order } as T;
  };
  const operations = orderOperations(async () => {
    authorizations++;
    return {
      sdk,
      membership: {
        seller: { id: "seller_current", status: "open" },
        member: { is_active: active },
      } as SellerMemberDTO,
    };
  });
  return { operations, calls, authorizations: () => authorizations };
}

test("tabs map to native server filters and preserve bounded pagination", () => {
  assert.deepEqual(orderListInput({ tab: "shipped", page: "2" }).tab.filters, {
    status: "pending",
    fulfillment_stage: "shipped",
  });
  assert.deepEqual(orderListInput({ tab: "canceled" }).tab.filters, {
    status: "canceled",
  });
  assert.equal(
    orderListInput({ tab: "invented", page: "-1" }).tab.value,
    "all",
  );
  assert.equal(orderListInput({ page: "2" }).offset, 20);
  assert.deepEqual(
    ORDER_TABS.map((tab) => tab.label),
    [
      "Todos",
      "Pendientes",
      "Preparados",
      "Enviados",
      "Completados",
      "Cancelados",
    ],
  );
  assert.equal(
    orderListInput({ tab: "partially_fulfilled" }).tab.value,
    "fulfilled",
  );
  assert.equal(
    orderListInput({ tab: "partially_shipped" }).tab.value,
    "shipped",
  );
  assert.equal(orderListInput({ tab: "delivered" }).tab.value, "shipped");
});

test("visible stages and grouped filters agree without hiding partial orders", () => {
  const timestamp = new Date(0);
  const prepared = { id: "ful_1", packed_at: timestamp };
  const sent = { id: "ful_2", packed_at: timestamp, shipped_at: timestamp };
  const delivered = { id: "ful_3", delivered_at: timestamp };
  const examples = [
    [[], "pending", "pending"],
    [[prepared], "fulfilled", "prepared"],
    [[{ ...prepared, canceled_at: timestamp }], "pending", "pending"],
    [[sent], "shipped", "shipped"],
    [[delivered], "shipped", "shipped"],
    [[prepared, sent], "shipped", "shipped"],
    [[prepared, { ...sent, canceled_at: timestamp }], "fulfilled", "prepared"],
  ] as const;
  for (const [fulfillments, expected, stage] of examples) {
    const order = fixture({
      fulfillments: [...fulfillments] as OrderDetailDTO["fulfillments"],
    });
    assert.equal(getOrderDisplayStatus(order), expected);
    const matching = ORDER_TABS.filter((tab) => {
      const filters = tab.filters;
      return (
        "fulfillment_stage" in filters &&
        filters.status === order.status &&
        filters.fulfillment_stage === stage
      );
    });
    assert.deepEqual(
      matching.map((tab) => tab.value),
      [expected],
    );
    assert.equal(
      getOrderDisplayStatus({ ...order, status: "completed" }),
      "completed",
    );
    assert.equal(
      getOrderDisplayStatus({ ...order, status: "canceled" }),
      "canceled",
    );
  }
});
test("preparation sends only selected pending quantities with the current seller and native payload", async () => {
  const h = harness();
  await h.operations.execute(
    form({
      action: "prepare",
      location_id: "loc_1",
      "quantity:item_1": "2",
      seller_id: "seller_other",
    }),
  );
  assert.equal(h.authorizations(), 1);
  assert.equal(h.calls[1].path, "/vendor/warehouse");
  assert.equal(h.calls[2].path, "/vendor/orders/order_1/fulfillments");
  assert.deepEqual(h.calls[2].init?.body, {
    location_id: "loc_approved",
    requires_shipping: true,
    items: [{ id: "item_1", quantity: 2 }],
  });
  for (const call of h.calls)
    assert.deepEqual(call.init?.headers, { "x-seller-id": "seller_current" });
});
test("preparation rejects negative, fractional, excess and foreign item quantities before mutation", async () => {
  for (const [key, quantity] of [
    ["quantity:item_1", "-1"],
    ["quantity:item_1", "1.5"],
    ["quantity:item_1", "3"],
    ["quantity:other", "1"],
    ["quantity:item_1", "0"],
  ]) {
    const h = harness();
    await assert.rejects(
      h.operations.execute(
        form({ action: "prepare", location_id: "loc_1", [key]: quantity }),
      ),
    );
    assert.ok(h.calls.every((call) => call.init?.method !== "POST"));
  }
});
test("ship delegates kit quantities to native workflow and validates tracking URLs", async () => {
  const h = harness();
  await h.operations.execute(
    form({
      action: "ship",
      fulfillment_id: "ful_1",
      tracking_number: "TRACK1",
      tracking_url: "https://carrier.example/track/1",
    }),
  );
  assert.equal(
    h.calls[1].path,
    "/vendor/orders/order_1/fulfillments/ful_1/shipments",
  );
  assert.deepEqual(h.calls[1].init?.body, {
    items: [],
    labels: [
      {
        tracking_number: "TRACK1",
        tracking_url: "https://carrier.example/track/1",
        label_url: "",
      },
    ],
  });
  for (const url of [
    "javascript:alert(1)",
    "https://user:password@example.com",
  ]) {
    const invalid = harness();
    await assert.rejects(
      invalid.operations.execute(
        form({
          action: "ship",
          fulfillment_id: "ful_1",
          tracking_number: "1",
          tracking_url: url,
        }),
      ),
      /seguimiento/,
    );
    assert.equal(invalid.calls.length, 1);
  }
});
test("rejects stale, foreign fulfillments and repeated shipment or delivery", async () => {
  const foreign = harness();
  await assert.rejects(
    foreign.operations.execute(
      form({ action: "ship", fulfillment_id: "ful_other" }),
    ),
    /preparación/,
  );
  assert.equal(foreign.calls.length, 1);
  const shippedOrder = fixture();
  shippedOrder.fulfillments[0].shipped_at = new Date();
  const shipped = harness(shippedOrder);
  await assert.rejects(
    shipped.operations.execute(
      form({ action: "ship", fulfillment_id: "ful_1" }),
    ),
    /enviada/,
  );
  await shipped.operations.execute(
    form({ action: "deliver", fulfillment_id: "ful_1", confirmation: "yes" }),
  );
  assert.equal(
    shipped.calls.at(-1)?.path,
    "/vendor/orders/order_1/fulfillments/ful_1/mark-as-delivered",
  );
  assert.deepEqual(shipped.calls.at(-1)?.init?.body, {});
});
test("financial and arbitrary status operations are rejected and inactive members never reach HTTP", async () => {
  for (const action of ["refund", "set_status", "capture"]) {
    const h = harness();
    await assert.rejects(h.operations.execute(form({ action })), /operación/);
    assert.equal(h.calls.length, 0);
  }
  const inactive = harness(fixture(), false);
  await assert.rejects(
    inactive.operations.execute(
      form({ action: "cancel", confirmation: "yes" }),
    ),
    /membresía/,
  );
  assert.equal(inactive.calls.length, 0);
});
test("legacy cancellation cannot bypass the finance confirmation and allocation flow", async () => {
  const h = harness();
  await assert.rejects(
    h.operations.execute(form({ action: "cancel" })),
    /operación/,
  );
  await assert.rejects(
    h.operations.execute(
      form({ action: "cancel", confirmation: "yes", refund: "true" }),
    ),
    /operación/,
  );
  assert.equal(h.calls.length, 0);
});

test("completes shipped orders without a mandatory delivery step and cancels only unshipped preparations", async () => {
  const order = fixture();
  order.items![0].detail.fulfilled_quantity = 3;
  order.items![0].detail.shipped_quantity = 3;
  const h = harness(order);
  await h.operations.execute(form({ action: "complete", confirmation: "yes" }));
  assert.equal(h.calls.at(-1)?.path, "/vendor/orders/order_1/complete");
  const preparation = harness();
  await preparation.operations.execute(
    form({
      action: "cancel_fulfillment",
      fulfillment_id: "ful_1",
      confirmation: "yes",
    }),
  );
  assert.equal(
    preparation.calls.at(-1)?.path,
    "/vendor/orders/order_1/fulfillments/ful_1/cancel",
  );
  order.fulfillments[0].shipped_at = new Date();
  const shipped = harness(order);
  await assert.rejects(
    shipped.operations.execute(form({ action: "cancel", confirmation: "yes" })),
    /operación/,
  );
  await assert.rejects(
    shipped.operations.execute(
      form({
        action: "cancel_fulfillment",
        fulfillment_id: "ful_1",
        confirmation: "yes",
      }),
    ),
    /enviada/,
  );
  assert.ok(shipped.calls.every((call) => call.init?.method !== "POST"));
});

test("completion keeps partial shipments open and supports native delivery or non-shipping items", () => {
  const order = fixture();
  order.items![0].detail.shipped_quantity = 2;
  assert.equal(orderCapabilities(order).complete, false);
  order.items![0].detail.delivered_quantity = 3;
  assert.equal(orderCapabilities(order).complete, true);
  order.items![0].requires_shipping = false;
  assert.equal(orderCapabilities(order).complete, false);
  order.items![0].detail.fulfilled_quantity = 3;
  assert.equal(orderCapabilities(order).complete, true);
});

test("streams the order heading and filters before the scoped list resolves", async () => {
  const nativeRequire = createRequire(import.meta.url);
  const request = Promise.withResolvers<unknown>();
  const exports = {} as {
    default: (props: { searchParams: Promise<object> }) => Promise<ReactNode>;
  };
  const queries: Record<string, unknown>[] = [];
  runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL(
          "../../app/seller/(workspace)/orders/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    {
      exports,
      URLSearchParams,
      require: (id: string) => {
        if (id === "next/link") return { default: "a" };
        if (id === "@/components/ui/card") return { Card: "section" };
        if (id === "@/components/ui/skeleton")
          return { Skeleton: () => "Loading orders" };
        if (id === "@/components/vendor/recent-orders")
          return { RecentOrders: () => "Orders resolved" };
        if (id === "@/features/orders/parameters")
          return {
            orderListInput,
            ORDER_TABS,
          };
        if (id === "@/features/workspace/components")
          return {
            PageHeading: ({ title }: { title: string }) =>
              createElement("h1", {}, title),
            SearchForm: () => "Search filters",
            Pagination: () => null,
            DataError: () => "Failed",
          };
        if (id === "@/features/workspace/data")
          return {
            ORDER_LIST_FIELDS: "id,items.thumbnail",
            resultOf: async (promise: Promise<unknown>) => ({
              data: await promise,
            }),
            workspace: async () => ({
              client: {
                get: (path: string, query: Record<string, unknown>) => {
                  assert.equal(path, "/vendor/orders");
                  queries.push(query);
                  return request.promise;
                },
              },
            }),
          };
        return nativeRequire(id);
      },
    },
  );
  const tree = await exports.default({
    searchParams: Promise.resolve({ tab: "shipped", q: "chair", page: "2" }),
  });
  let html = "";
  const sink = new PassThrough();
  sink.on("data", (chunk: Buffer) => {
    html += chunk.toString();
  });
  const ready = Promise.withResolvers<void>();
  const complete = Promise.withResolvers<void>();
  const stream = renderToPipeableStream(tree, {
    onShellReady() {
      stream.pipe(sink);
      ready.resolve();
    },
    onAllReady() {
      complete.resolve();
    },
    onError(error) {
      ready.reject(error);
      complete.reject(error);
    },
  });
  try {
    await ready.promise;
    assert.match(html, /Pedidos de la tienda/);
    assert.match(html, /Search filters/);
    for (const tab of ORDER_TABS) assert.ok(html.includes(tab.label));
    assert.doesNotMatch(
      html,
      /Preparación parcial|Envío parcial|Entrega parcial|Entregados/,
    );
    assert.doesNotMatch(html, /Orders resolved/);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(queries[0].fulfillment_stage, "shipped");
    assert.equal(queries[0].fulfillment_status, undefined);
    assert.equal(queries[0].status, "pending");
    assert.equal(queries[0].offset, 20);
    assert.equal(queries[0].q, "chair");
    request.resolve({ orders: [], count: 0 });
    await complete.promise;
  } finally {
    stream.abort();
  }
});

test("pending preparation quantities reject missing or malformed data instead of inventing availability", async () => {
  for (const invalid of [
    undefined,
    null,
    "",
    "bad",
    -1,
    1.5,
    Infinity,
    true,
    {},
  ]) {
    for (const field of ["quantity", "fulfilled_quantity"] as const) {
      const order = fixture();
      if (field === "quantity")
        Object.assign(order.items![0], { quantity: invalid });
      else
        Object.assign(order.items![0].detail, { fulfilled_quantity: invalid });
      assert.equal(remainingToPrepare(order.items![0]), null);
      assert.equal(orderCapabilities(order).prepare, false);
      assert.match(preparationIssue(order)!, /verificar/);
      const h = harness(order);
      await assert.rejects(
        h.operations.execute(
          form({ action: "prepare", "quantity:item_1": "1" }),
        ),
        /verificar/,
      );
      assert.ok(h.calls.every((call) => call.init?.method !== "POST"));
    }
  }
  const order = fixture();
  Object.assign(order.items![0], { quantity: undefined });
  Object.assign(order.items![0].detail, {
    quantity: "3",
    fulfilled_quantity: "1",
  });
  assert.equal(remainingToPrepare(order.items![0]), 2);
  Object.assign(order.items![0].detail, { fulfilled_quantity: 4 });
  assert.equal(remainingToPrepare(order.items![0]), null);
});

test("preparation uses the approved warehouse without a location choice and allows optional partial quantities", async () => {
  const h = harness();
  await h.operations.execute(
    form({ action: "prepare", "quantity:item_1": "1" }),
  );
  assert.deepEqual(h.calls.at(-1)?.init?.body, {
    location_id: "loc_approved",
    requires_shipping: true,
    items: [{ id: "item_1", quantity: 1 }],
  });
  for (const warehouse of [
    {},
    { stock_location: null },
    { stock_location: { id: "" } },
    new FetchError("Unavailable", "Rejected", 409),
    new FetchError("Offline", "Rejected", 503),
  ]) {
    const blocked = harness(fixture(), true, warehouse);
    await assert.rejects(
      blocked.operations.execute(
        form({ action: "prepare", "quantity:item_1": "2" }),
      ),
    );
    assert.ok(blocked.calls.every((call) => call.init?.method !== "POST"));
  }
});

async function renderManagement(
  order: OrderDetailDTO,
  warehouse: Promise<unknown>,
) {
  const nativeRequire = createRequire(import.meta.url);
  const exports = {} as {
    OrderManagement: (props: { order: OrderDetailDTO }) => ReactNode;
  };
  const queries: string[] = [];
  runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("./order-management.tsx", import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    {
      exports,
      URL,
      TypeError,
      Error,
      require: (id: string) => {
        if (id === "next/link") return { default: "a" };
        if (id === "@/components/ui/card")
          return {
            Card: "section",
            CardHeader: "header",
            CardTitle: "h2",
            CardContent: "div",
          };
        if (id === "@/components/ui/input") return { Input: "input" };
        if (id === "@/components/ui/skeleton") return { Skeleton: "div" };
        if (id === "../workspace/components")
          return {
            DataError: ({ message }: { message: string }) =>
              createElement("p", { role: "alert" }, message),
          };
        if (id === "../workspace/presentation")
          return { formatDate: () => "date" };
        if (id === "../inventory/data") return { sellerWarehouse };
        if (id === "./operations")
          return { orderCapabilities, preparationIssue, remainingToPrepare };
        if (id === "./order-action-form")
          return {
            OrderActionForm: ({
              children,
              label,
            }: {
              children: ReactNode;
              label: string;
            }) =>
              createElement(
                "form",
                {},
                children,
                createElement("button", {}, label),
              ),
          };
        if (id === "../workspace/data")
          return {
            workspace: async () => ({
              client: {
                get: (path: string) => {
                  queries.push(path);
                  return warehouse;
                },
              },
            }),
            resultOf: async (request: Promise<unknown>) => {
              try {
                return { data: await request };
              } catch (error) {
                return {
                  error:
                    error instanceof Error
                      ? error.message
                      : "No se pudo cargar el almacén.",
                };
              }
            },
          };
        return nativeRequire(id);
      },
    },
  );
  let html = "";
  const sink = new PassThrough();
  sink.on("data", (chunk: Buffer) => {
    html += chunk.toString();
  });
  const ready = Promise.withResolvers<void>();
  const done = Promise.withResolvers<void>();
  sink.on("end", () => done.resolve());
  const stream = renderToPipeableStream(exports.OrderManagement({ order }), {
    onShellReady() {
      stream.pipe(sink);
      ready.resolve();
    },
    onError(error) {
      ready.reject(error);
      done.reject(error);
    },
  });
  await ready.promise;
  return {
    html: () => html,
    done: done.promise,
    queries,
    abort: () => stream.abort(),
  };
}

test("single warehouse preparation streams locally and defaults all pending quantities behind optional partial editing", async () => {
  const warehouse = Promise.withResolvers<unknown>();
  const order = fixture({ fulfillments: [] });
  order.items![0].title = "Artículo pendiente";
  order.items!.push({ ...order.items![0], id: "item_done", quantity: 1 });
  const view = await renderManagement(order, warehouse.promise);
  try {
    assert.match(view.html(), /Preparar artículos/);
    assert.match(view.html(), /Cargando almacén aprobado/);
    assert.match(view.html(), /Sin preparaciones registradas/);
    assert.doesNotMatch(view.html(), /Preparar para envío/);
    warehouse.resolve(approvedWarehouse);
    await view.done;
    assert.deepEqual(view.queries, ["/vendor/warehouse"]);
    assert.match(view.html(), /Preparar para envío/);
    assert.match(view.html(), /Almacén aprobado/);
    assert.doesNotMatch(
      view.html(),
      /<select|Selecciona un almacén|quantity:item_done/,
    );
    assert.match(
      view.html(),
      /<details[^>]*><summary[^>]*>Preparar solo una parte \(opcional\)/,
    );
    assert.doesNotMatch(view.html(), /<details[^>]*open/);
    assert.match(view.html(), /name="quantity:item_1"[^>]*value="2"/);
    const h = harness(order);
    await h.operations.execute(
      form({ action: "prepare", "quantity:item_1": "2" }),
    );
    assert.deepEqual(h.calls.at(-1)?.init?.body, {
      location_id: "loc_approved",
      requires_shipping: true,
      items: [{ id: "item_1", quantity: 2 }],
    });
  } finally {
    view.abort();
  }
});

test("missing items, shipping flags and exhausted quantities explain why preparation is unavailable", async () => {
  const missingShipping = fixture({ fulfillments: [] });
  Object.assign(missingShipping.items![0], { requires_shipping: undefined });
  const exhausted = fixture({ fulfillments: [] });
  exhausted.items![0].detail.fulfilled_quantity = 3;
  for (const [order, message] of [
    [
      fixture({ items: undefined, fulfillments: [] }),
      /No se cargaron los artículos/,
    ],
    [fixture({ items: [], fulfillments: [] }), /No se cargaron los artículos/],
    [missingShipping, /No se pudieron verificar/],
    [exhausted, /No quedan artículos pendientes/],
    [
      fixture({ status: "canceled", fulfillments: [] }),
      /estado actual del pedido/,
    ],
  ] as const) {
    const view = await renderManagement(
      order,
      Promise.resolve(approvedWarehouse),
    );
    await view.done;
    assert.match(view.html(), message);
    assert.doesNotMatch(view.html(), /Preparar para envío/);
    assert.deepEqual(view.queries, []);
  }
});

test("warehouse conflicts, malformed responses and service failures keep useful local errors", async () => {
  for (const warehouse of [
    {},
    { stock_location: null },
    new FetchError("Conflict", "Rejected", 409),
    new FetchError("Offline", "Rejected", 503),
  ]) {
    const request = Promise.withResolvers<unknown>();
    const view = await renderManagement(
      fixture({ fulfillments: [] }),
      request.promise,
    );
    if (warehouse instanceof Error) request.reject(warehouse);
    else request.resolve(warehouse);
    await view.done;
    assert.match(view.html(), /Preparaciones y envíos/);
    assert.match(view.html(), /Actualiza la página|Revisa tu almacén/);
    assert.doesNotMatch(view.html(), /Preparar para envío/);
  }
});

test("detail and action reads select native order-item counters so formatting retains quantities and totals", async () => {
  // Exercise the installed Medusa mapper/formatter: items.quantity alone targets
  // the line-item relation, while formatOrder reads the order-item quantity.
  const apiRequire = createRequire(
    new URL("../../../../../packages/api/package.json", import.meta.url),
  );
  const medusaRequire = createRequire(
    apiRequire.resolve("@medusajs/medusa/package.json"),
  );
  const { mapRepositoryToOrderModel, formatOrder } = medusaRequire(
    "@medusajs/order/dist/utils/transform-order.js",
  ) as {
    mapRepositoryToOrderModel: (config: {
      options: { fields: string[]; populate: string[] };
    }) => { options: { fields: string[] } };
    formatOrder: (
      order: unknown,
      options: { entity: unknown; includeTotals: boolean },
    ) => OrderDetailDTO;
  };
  const { Order } = medusaRequire("@medusajs/order/dist/models") as {
    Order: unknown;
  };
  const source = readFileSync(
    new URL("../workspace/data.ts", import.meta.url),
    "utf8",
  );
  const detailFields = source.match(
    /export const ORDER_FIELDS\s*=\s*"([^"]+)"/,
  )?.[1];
  assert.ok(detailFields);
  const h = harness();
  await h.operations.execute(
    form({ action: "prepare", "quantity:item_1": "2" }),
  );
  const actionFields = h.calls[0].init?.query?.fields;
  assert.equal(typeof actionFields, "string");
  for (const fields of [detailFields, actionFields as string]) {
    const selected = mapRepositoryToOrderModel({
      options: { fields: fields.split(","), populate: [] },
    }).options.fields;
    for (const field of [
      "quantity",
      "fulfilled_quantity",
      "shipped_quantity",
      "delivered_quantity",
    ])
      assert.ok(
        selected.includes(`items.${field}`),
        `Missing native order-item ${field}`,
      );
    const order = formatOrder(
      {
        id: "order_1",
        status: "pending",
        fulfillments: [],
        items: [
          {
            quantity: selected.includes("items.quantity") ? 2 : undefined,
            fulfilled_quantity: selected.includes("items.fulfilled_quantity")
              ? 0
              : undefined,
            item: { id: "item_1", unit_price: 200, requires_shipping: true },
          },
        ],
        shipping_methods: [{ shipping_method: { amount: 20 } }],
      },
      { entity: Order, includeTotals: true },
    );
    assert.equal(order.items![0].quantity, 2);
    assert.equal(Number(order.items![0].total), 400);
    assert.equal(Number(order.total), 420);
    assert.equal(orderCapabilities(order).prepare, true);
    assert.equal(remainingToPrepare(order.items![0]), 2);
  }
});

import { financePayload, financeRequest } from "./finance-form";

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
  data.set("action", "capture");
  assert.throws(() => financePayload(data), /disponible/);
});

import type { OrderFinanceResponse } from "@marketplace-v2/api/finance-contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderFinanceHistory } from "./finance-history";

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

test("seller finance rejects capture even with valid confirmation and UUID", () => {
  const data = new FormData();
  data.set("action", "capture");
  data.set("note", "Cobro autorizado");
  data.set("confirm", "yes");
  data.set("request_id", "12345678-1234-4123-8123-123456789012");
  assert.throws(() => financePayload(data), /disponible/);
});
