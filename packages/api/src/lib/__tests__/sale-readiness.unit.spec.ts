import type { MedusaContainer } from "@medusajs/framework/types";
import { getStripeConnectConfiguration } from "../stripe-connect-configuration";
import { assertCartSellersReadyForSale, assertPaymentCollectionSellersReadyForSale } from "../stripe-connect/sale-readiness";

jest.mock("../stripe-connect-configuration", () => ({ getStripeConnectConfiguration: jest.fn() }));

const seller = (id = "seller_a") => ({
  id, status: "open", payout_account: {
    id: `pacc_${id}`, status: "active", data: {
      id: `acct_${id}`, country: "US", metadata: { account_id: `pacc_${id}` },
    },
  },
});

function fixture() {
  const cart = {
    id: "cart_a", completed_at: null, currency_code: "usd",
    items: [{ id: "item_a", offer: { seller_id: "seller_a" } }],
  };
  const graph = jest.fn().mockResolvedValueOnce({ data: [cart] }).mockResolvedValue({ data: [seller()] });
  const container = { resolve: jest.fn().mockReturnValue({ graph }) } as unknown as MedusaContainer;
  return { cart, graph, container };
}

beforeEach(() => {
  jest.mocked(getStripeConnectConfiguration).mockReturnValue({} as NonNullable<ReturnType<typeof getStripeConnectConfiguration>>);
});

it("accepts a USD cart only when its current seller has an active bound Stripe account", async () => {
  const { container, graph } = fixture();
  await expect(assertCartSellersReadyForSale(container, "cart_a")).resolves.toBeUndefined();
  expect(graph).toHaveBeenNthCalledWith(1, expect.objectContaining({ entity: "cart", filters: { id: "cart_a" } }), { cache: { enable: false } });
  expect(graph).toHaveBeenNthCalledWith(2, expect.objectContaining({ entity: "seller", filters: { id: ["seller_a"] } }), { cache: { enable: false } });
});

it("checks every distinct seller in one request for multi-seller carts", async () => {
  const { cart, graph, container } = fixture();
  cart.items.push({ id: "item_b", offer: { seller_id: "seller_b" } }, { id: "item_c", offer: { seller_id: "seller_a" } });
  graph.mockResolvedValue({ data: [seller(), seller("seller_b")] });
  await assertCartSellersReadyForSale(container, "cart_a");
  expect(graph).toHaveBeenLastCalledWith(expect.objectContaining({ filters: { id: ["seller_a", "seller_b"] } }), { cache: { enable: false } });
  expect(graph).toHaveBeenCalledTimes(2);
});

it.each(["pending", "restricted", "rejected", undefined])("rejects a %s payout account without changing catalog state", async (status) => {
  const { graph, container } = fixture();
  const current = seller();
  graph.mockResolvedValue({ data: [{ ...current, payout_account: { ...current.payout_account, status } }] });
  await expect(assertCartSellersReadyForSale(container, "cart_a")).rejects.toThrow("not completed Stripe setup");
});

it.each(["pending_approval", "suspended", "terminated"])('rejects a seller with status "%s" even when payout is active', async (status) => {
  const { graph, container } = fixture();
  graph.mockResolvedValue({ data: [{ ...seller(), status }] });
  await expect(assertCartSellersReadyForSale(container, "cart_a")).rejects.toThrow("not completed Stripe setup");
});

it.each([
  { data: [] }, { data: [{ ...seller(), payout_account: null }] },
  { data: [{ ...seller(), payout_account: { id: "pacc_seller_a", status: "active", data: {} } }] },
  { data: [seller("seller_other")] },
])("rejects missing sellers, system-provider data, and missing payout links: %j", async (result) => {
  const { graph, container } = fixture();
  graph.mockResolvedValue(result);
  await expect(assertCartSellersReadyForSale(container, "cart_a")).rejects.toThrow("not completed Stripe setup");
});

it.each([
  { id: "system_account" }, { id: "acct_" }, { country: "CA" },
  { metadata: { account_id: "pacc_other" } }, { metadata: {} },
])("rejects malformed or mismatched persisted Stripe identity: %j", async (overrides) => {
  const { graph, container } = fixture();
  const current = seller();
  graph.mockResolvedValue({ data: [{ ...current, payout_account: { ...current.payout_account, data: { ...current.payout_account.data, ...overrides } } }] });
  await expect(assertCartSellersReadyForSale(container, "cart_a")).rejects.toThrow("not completed Stripe setup");
});

it("does not accept a partial seller query result", async () => {
  const { cart, container } = fixture();
  cart.items.push({ id: "item_b", offer: { seller_id: "seller_missing" } });
  await expect(assertCartSellersReadyForSale(container, "cart_a")).rejects.toThrow("not completed Stripe setup");
});

it("rejects an item without a seller before a potentially unbounded seller query", async () => {
  const { cart, graph, container } = fixture();
  cart.items[0].offer.seller_id = "";
  await expect(assertCartSellersReadyForSale(container, "cart_a")).rejects.toThrow();
  expect(graph).toHaveBeenCalledTimes(1);
});

it("rejects empty carts and non-USD carts", async () => {
  for (const overrides of [{ items: [] }, { currency_code: "eur" }]) {
    const { cart, graph, container } = fixture();
    Object.assign(cart, overrides);
    await expect(assertCartSellersReadyForSale(container, "cart_a")).rejects.toThrow();
    expect(graph).toHaveBeenCalledTimes(1);
  }
});

it("blocks new sales when test Stripe configuration is missing", async () => {
  const { container, graph } = fixture();
  jest.mocked(getStripeConnectConfiguration).mockReturnValue(null);
  await expect(assertCartSellersReadyForSale(container, "cart_a")).rejects.toThrow("not configured");
  expect(graph).toHaveBeenCalledTimes(1);
});

it("preserves completion retry behavior after a sale without rechecking later restrictions", async () => {
  const { cart, graph, container } = fixture();
  Object.assign(cart, { completed_at: "2026-09-06T00:00:00Z" });
  jest.mocked(getStripeConnectConfiguration).mockReturnValue(null);
  await expect(assertCartSellersReadyForSale(container, "cart_a")).resolves.toBeUndefined();
  expect(graph).toHaveBeenCalledTimes(1);
});

it("requires a cart ID and propagates unavailable persistence without permitting a sale", async () => {
  const { graph, container } = fixture();
  await expect(assertCartSellersReadyForSale(container, "")).rejects.toThrow("cart is required");
  expect(graph).not.toHaveBeenCalled();
  graph.mockReset().mockRejectedValue(new Error("offline persistence failure"));
  await expect(assertCartSellersReadyForSale(container, "cart_a")).rejects.toThrow("offline persistence failure");
});

it("maps native payment collection to the current cart before checking seller readiness", async () => {
  const { cart, graph, container } = fixture();
  graph.mockReset().mockResolvedValueOnce({ data: [{ cart_id: "cart_a" }] })
    .mockResolvedValueOnce({ data: [cart] }).mockResolvedValueOnce({ data: [seller()] });
  await assertPaymentCollectionSellersReadyForSale(container, "paycol_a");
  expect(graph).toHaveBeenNthCalledWith(1, {
    entity: "cart_payment_collection", fields: ["cart_id"], filters: { payment_collection_id: "paycol_a" },
  }, { cache: { enable: false } });
  expect(graph).toHaveBeenCalledTimes(3);
});

it.each([{ data: [] }, { data: [{ cart_id: null }] }, { data: [{ cart_id: "cart_a" }, { cart_id: "cart_b" }] }])
  ("rejects absent and ambiguous payment collection cart links: %j", async (result) => {
    const { graph, container } = fixture();
    graph.mockReset().mockResolvedValueOnce(result);
    await expect(assertPaymentCollectionSellersReadyForSale(container, "paycol_a")).rejects.toThrow("checkout cart is required");
    expect(graph).toHaveBeenCalledTimes(1);
  });

it("rejects a new payment session for an already completed cart", async () => {
  const { cart, graph, container } = fixture();
  graph.mockReset().mockResolvedValueOnce({ data: [{ cart_id: "cart_a" }] })
    .mockResolvedValueOnce({ data: [{ ...cart, completed_at: "2026-09-06T00:00:00Z" }] });
  await expect(assertPaymentCollectionSellersReadyForSale(container, "paycol_a")).rejects.toThrow("already completed");
  expect(graph).toHaveBeenCalledTimes(2);
});
