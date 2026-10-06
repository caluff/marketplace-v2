import { getOrderDetailWorkflow } from "@medusajs/core-flows";
import type { MedusaContainer } from "@medusajs/framework/types";
import { createOrderTrackingToken } from "../access";
import { readOrderTracking } from "../read";

jest.mock("@medusajs/core-flows", () => ({ getOrderDetailWorkflow: jest.fn() }));
const graph = jest.fn();
const run = jest.fn();
const container = { resolve: () => ({ graph }) } as unknown as MedusaContainer;
const identity = { id: "order_Test123", email: "guest@example.test", is_draft_order: false };
const originalSecret = process.env.JWT_SECRET;

function nativeOrder() {
  return {
    ...identity,
    display_id: 18, custom_display_id: null, created_at: new Date(), status: "pending",
    fulfillment_status: "shipped", currency_code: "usd", total: 620,
    items: [{ id: "ordli_test", title: "Product", variant_title: "One", thumbnail: null, quantity: 3, unit_price: 200,
      detail: { fulfilled_quantity: 3, shipped_quantity: 3, delivered_quantity: 0, metadata: { secret: "hidden" } },
      metadata: { secret: "hidden" } }],
    shipping_address: { address_1: "Private address" },
    customer: { id: "cus_test", phone: "private" },
    payment_collections: [{ payments: [{ data: { provider_secret: "private" } }] }],
    fulfillments: [{
      id: "ful_test", created_at: new Date("2026-10-01T12:00:00Z"), packed_at: new Date("2026-10-01T12:01:00Z"),
      shipped_at: new Date("2026-10-02T12:00:00Z"), delivered_at: null, canceled_at: null,
      data: { provider_data: "private" },
      labels: [
        { tracking_number: "TRACK123", tracking_url: "https://carrier.example.test/track/123", label_url: "private" },
        { tracking_number: "TRACK456", tracking_url: "javascript:alert(1)" },
      ],
    }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "tracking-read-test-secret-32-characters";
  graph.mockResolvedValue({ data: [{ ...identity }] });
  jest.mocked(getOrderDetailWorkflow).mockReturnValue({ run } as unknown as ReturnType<typeof getOrderDetailWorkflow>);
  run.mockResolvedValue({ result: nativeOrder() });
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

it("authorizes one current recipient and returns only the tracking projection", async () => {
  const result = await readOrderTracking(container, createOrderTrackingToken(identity));
  expect(graph).toHaveBeenCalledWith(expect.objectContaining({ filters: { id: identity.id }, fields: ["id", "email", "is_draft_order"] }), { cache: { enable: false } });
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({
    order_id: identity.id, filters: { is_draft_order: false },
    fields: expect.arrayContaining(["items.detail.*", "fulfillments.created_at", "fulfillments.packed_at"]),
  }) }));
  expect(result.order.total).toBe(620);
  expect(result.order.items[0].quantity).toBe(3);
  expect(result.order.fulfillment_status).toBe("shipped");
  expect(result.order).not.toHaveProperty("email");
  expect(result.order).not.toHaveProperty("shipping_address");
  expect(result.order).not.toHaveProperty("customer");
  expect(result.order).not.toHaveProperty("payment_collections");
  expect(result.order.items[0]).not.toHaveProperty("metadata");
  expect(result.order.items[0].detail).toEqual({ fulfilled_quantity: 3, shipped_quantity: 3, delivered_quantity: 0 });
  expect(result.order.fulfillments[0]).not.toHaveProperty("data");
  expect(result.order.fulfillments[0].labels[0]).not.toHaveProperty("label_url");
  expect(result.order.fulfillments[0].labels[0].tracking_url).toBe("https://carrier.example.test/track/123");
  expect(result.order.fulfillments[0].labels[1].tracking_url).toBeNull();
});

it("preserves partial native quantities and canceled package dates without promoting completed milestones", async () => {
  const native = nativeOrder();
  run.mockResolvedValue({ result: {
    ...native, fulfillment_status: "partially_delivered",
    items: [{ ...native.items[0], detail: { fulfilled_quantity: "2", shipped_quantity: "1", delivered_quantity: "1" } }],
    fulfillments: [
      { ...native.fulfillments[0], delivered_at: "2026-10-03T12:00:00Z" },
      { ...native.fulfillments[0], id: "ful_unshipped", shipped_at: null, delivered_at: null },
      { ...native.fulfillments[0], id: "ful_canceled", packed_at: "2026-10-04T12:00:00Z", shipped_at: null,
        delivered_at: null, canceled_at: "2026-10-05T12:00:00Z" },
    ],
  } });
  const response = await readOrderTracking(container, createOrderTrackingToken(identity));
  expect(response.order.fulfillment_status).toBe("partially_delivered");
  expect(response.order.items[0].quantity).toBe(3);
  expect(response.order.items[0].detail).toEqual({ fulfilled_quantity: 2, shipped_quantity: 1, delivered_quantity: 1 });
  expect(response.order.fulfillments[0]).toMatchObject({
    created_at: "2026-10-01T12:00:00.000Z", packed_at: "2026-10-01T12:01:00.000Z",
    shipped_at: "2026-10-02T12:00:00.000Z", delivered_at: "2026-10-03T12:00:00Z", canceled_at: null,
  });
  expect(response.order.fulfillments[1].shipped_at).toBeNull();
  expect(response.order.fulfillments[2]).toMatchObject({
    packed_at: "2026-10-04T12:00:00Z", canceled_at: "2026-10-05T12:00:00Z",
  });
});

it("keeps missing historical quantities and package milestones unknown instead of inventing zeros or dates", async () => {
  const native = nativeOrder();
  for (const detail of [undefined, null, { fulfilled_quantity: null }]) {
    run.mockResolvedValue({ result: {
      ...native, items: [{ ...native.items[0], detail }],
      fulfillments: [{ ...native.fulfillments[0], created_at: undefined, packed_at: null }],
    } });
    const response = await readOrderTracking(container, createOrderTrackingToken(identity));
    expect(response.order.items[0].detail).toEqual(detail ? {
      fulfilled_quantity: null, shipped_quantity: null, delivered_quantity: null,
    } : null);
    expect(response.order.fulfillments[0].created_at).toBeNull();
    expect(response.order.fulfillments[0].packed_at).toBeNull();
    expect(response.order.fulfillments[0].shipped_at).toBe("2026-10-02T12:00:00.000Z");
  }
});

it("preserves explicit timestamp offsets and rejects dates without a valid instant", async () => {
  const native = nativeOrder();
  run.mockResolvedValue({ result: { ...native, fulfillments: [{ ...native.fulfillments[0],
    created_at: "2026-10-01T23:30:00-04:00", packed_at: "2026-10-02T00:10:00-04:00",
  }] } });
  const response = await readOrderTracking(container, createOrderTrackingToken(identity));
  expect(response.order.fulfillments[0].created_at).toBe("2026-10-01T23:30:00-04:00");
  expect(response.order.fulfillments[0].packed_at).toBe("2026-10-02T00:10:00-04:00");
  for (const packed_at of ["2026-10-02T12:00:00", "invalid", new Date(Number.NaN)]) {
    run.mockResolvedValue({ result: { ...native, fulfillments: [{ ...native.fulfillments[0], packed_at }] } });
    await expect(readOrderTracking(container, createOrderTrackingToken(identity))).rejects.toThrow();
  }
});

it("does not query an order for an invalid or expired signature", async () => {
  for (const token of ["invalid", createOrderTrackingToken(identity, process.env, Date.now() - 91 * 24 * 60 * 60 * 1000)]) {
    await expect(readOrderTracking(container, token)).rejects.toThrow("no es válido");
  }
  expect(graph).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
});

it("hides missing orders, drafts and orders whose recipient changed", async () => {
  const token = createOrderTrackingToken(identity);
  for (const data of [[], [{ ...identity, is_draft_order: true }], [{ ...identity, email: "different@example.test" }]]) {
    graph.mockResolvedValue({ data });
    await expect(readOrderTracking(container, token)).rejects.toThrow("no es válido");
  }
  expect(run).not.toHaveBeenCalled();
});

it("rechecks the recipient on the native detail to close the read race", async () => {
  run.mockResolvedValue({ result: { ...nativeOrder(), email: "changed@example.test" } });
  await expect(readOrderTracking(container, createOrderTrackingToken(identity))).rejects.toThrow("no es válido");
});

it("uses persisted line images first, then the current product thumbnail or gallery without exposing product data", async () => {
  for (const [lineThumbnail, productThumbnail, expected] of [
    ["https://images.example.test/snapshot.jpg", "https://images.example.test/thumbnail.jpg", "https://images.example.test/snapshot.jpg"],
    [null, "https://images.example.test/thumbnail.jpg", "https://images.example.test/thumbnail.jpg"],
    [null, null, "https://images.example.test/gallery.jpg"],
  ]) {
    const native = nativeOrder();
    run.mockResolvedValue({ result: { ...native, items: [{ ...native.items[0], thumbnail: lineThumbnail,
      variant: { product: { id: "prod_private", metadata: { private: true }, thumbnail: productThumbnail,
        images: [{ url: "https://images.example.test/gallery.jpg" }] } },
    }] } });
    const response = await readOrderTracking(container, createOrderTrackingToken(identity));
    expect(response.order.items[0].thumbnail).toBe(expected);
    expect(response.order.items[0]).not.toHaveProperty("variant");
  }
});
