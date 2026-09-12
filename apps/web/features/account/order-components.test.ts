import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HttpTypes } from "@medusajs/types";
import type { AccountOrder } from "./order-data";
import { OrderItems } from "./components/order-items";
import {
  OrderShipmentHistory,
  OrderTracking,
} from "./components/order-tracking";
import { OrderTotals } from "./components/order-summary";

test("order cards render native product snapshots and hide internal variants", () => {
  const items = [
    {
      id: "item1",
      title: "Auriculares",
      thumbnail: "/product.png",
      product_handle: "auriculares",
      variant_title: "__default__",
      quantity: 2,
      total: 400,
    },
  ] as HttpTypes.StoreOrderLineItem[];
  const html = renderToStaticMarkup(
    createElement(OrderItems, { items, currencyCode: "usd" }),
  );
  assert.match(html, /alt="Auriculares"/);
  assert.match(html, /\/products\/auriculares/);
  assert.match(html, /Cantidad: 2/);
  assert.doesNotMatch(html, /__default__/);
  assert.match(html, /400,00/);
});

test("order images use product images when the order snapshot has no thumbnail", () => {
  for (const [thumbnail, productThumbnail, expected] of [
    ["/snapshot.png", "/thumbnail.png", "snapshot.png"],
    [null, "/thumbnail.png", "thumbnail.png"],
    [null, null, "gallery.png"],
  ]) {
    const items = [
      {
        id: "item1",
        title: "Auriculares",
        quantity: 1,
        total: 100,
        thumbnail,
        variant: {
          product: {
            thumbnail: productThumbnail,
            images: [{ url: "/gallery.png" }],
          },
        },
      },
    ] as HttpTypes.StoreOrderLineItem[];
    const html = renderToStaticMarkup(
      createElement(OrderItems, { items, currencyCode: "usd" }),
    );
    assert.ok(html.includes(expected!));
    assert.match(html, /<img/);
  }
});

test("tracking displays actual shipment dates and suppresses canceled tracking links", () => {
  const order = {
    status: "pending",
    fulfillment_status: "partially_shipped",
    fulfillments: [
      {
        id: "ful1",
        created_at: "2026-09-10T12:00:00Z",
        shipped_at: "2026-09-11T12:00:00Z",
        labels: [
          {
            tracking_number: "ABC",
            tracking_url: "https://tracking.example.com/ABC",
          },
        ],
      },
      {
        id: "ful2",
        created_at: "2026-09-10T12:00:00Z",
        canceled_at: "2026-09-11T12:00:00Z",
        labels: [
          {
            tracking_number: "CANCELED",
            tracking_url: "https://tracking.example.com/canceled",
          },
        ],
      },
    ],
  } as unknown as AccountOrder;
  const html = renderToStaticMarkup(createElement(OrderTracking, { order }));
  assert.match(html, /Enviado parcialmente/);
  assert.match(html, /Ver detalle/);
  assert.doesNotMatch(html, /<details|11 de setiembre de 2026/);
  const history = renderToStaticMarkup(
    createElement(OrderShipmentHistory, { order }),
  );
  assert.match(history, /11 de setiembre de 2026/);
  assert.match(html, /https:\/\/tracking.example.com\/ABC/);
  assert.doesNotMatch(html, /tracking.example.com\/canceled/);
});

test("order totals preserve native discounts and omit zero-valued charges", () => {
  const order = {
    currency_code: "usd",
    original_item_subtotal: 400,
    original_shipping_subtotal: 20,
    total: 410,
    discount_total: 10,
    discount_tax_total: 0,
    tax_total: 0,
    credit_line_total: 0,
  } as HttpTypes.StoreOrder;
  const html = renderToStaticMarkup(createElement(OrderTotals, { order }));
  assert.match(html, /410,00/);
  assert.match(html, /Descuentos/);
  assert.doesNotMatch(html, /Impuestos|Créditos aplicados/);
});

test("refund totals belong to this order and are not deducted twice", () => {
  const order = {
    currency_code: "usd",
    original_item_subtotal: 10,
    original_shipping_subtotal: 2,
    total: 11,
    discount_total: 0,
    discount_tax_total: 0,
    tax_total: 0,
    credit_line_total: 1,
    payment_status: "partially_refunded",
    summary: { refunded_total: 1 },
  } as HttpTypes.StoreOrder;
  const html = renderToStaticMarkup(createElement(OrderTotals, { order }));
  assert.match(html, /Reembolsado de este pedido/);
  assert.match(html, /11,00/);
  const otherOrder = renderToStaticMarkup(
    createElement(OrderTotals, {
      order: { ...order, summary: { ...order.summary, refunded_total: 0 } },
    }),
  );
  assert.doesNotMatch(otherOrder, /Reembolsado de este pedido/);
});

test("canceled preparations preserve the order timeline and kit items appear once", () => {
  const order = {
    status: "pending",
    fulfillment_status: "canceled",
    items: [{ id: "item1", title: "Kit de audio", quantity: 1 }],
    fulfillments: [
      {
        id: "ful1",
        canceled_at: "2026-09-11T12:00:00Z",
        items: [
          { line_item_id: "item1", quantity: 3 },
          { line_item_id: "item1", quantity: 5 },
        ],
      },
    ],
  } as unknown as AccountOrder;
  const html = renderToStaticMarkup(createElement(OrderTracking, { order }));
  assert.match(html, /Preparaciones canceladas/);
  assert.match(html, /Pedido recibido/);
  assert.doesNotMatch(html, /Pedido cancelado/);
  const history = renderToStaticMarkup(
    createElement(OrderShipmentHistory, { order }),
  );
  assert.equal(history.match(/Kit de audio/g)?.length, 1);
  assert.doesNotMatch(html, /[35] ×/);
  assert.doesNotMatch(html, /aria-current="step"/);
});

test("tracking identifies a single next step and none after delivery or cancellation", () => {
  const order = {
    status: "pending",
    fulfillment_status: "not_fulfilled",
  } as AccountOrder;
  const pending = renderToStaticMarkup(createElement(OrderTracking, { order }));
  assert.equal(pending.match(/aria-current="step"/g)?.length, 1);
  assert.match(pending, /Próximo paso/);

  for (const state of [
    { status: "completed", fulfillment_status: "delivered" },
    { status: "canceled", fulfillment_status: "not_fulfilled" },
  ] as const) {
    const html = renderToStaticMarkup(
      createElement(OrderTracking, { order: { ...order, ...state } }),
    );
    assert.doesNotMatch(html, /aria-current="step"|Próximo paso/);
  }
});
