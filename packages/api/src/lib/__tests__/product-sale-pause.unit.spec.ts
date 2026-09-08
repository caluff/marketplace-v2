import type { MedusaContainer } from "@medusajs/framework/types";
import {
  assertCartProductsNotPaused,
  assertCartLineIncreaseNotPaused,
  assertOffersNotPaused,
  pausedProducts,
  PAUSED_PRODUCTS_KEY,
} from "../catalog/sale-pause";

function fixture() {
  const offer = {
    id: "offer_a",
    product_id: "prod_a",
    seller: { id: "seller_a", metadata: { [PAUSED_PRODUCTS_KEY]: ["prod_a"] } },
  };
  const graph = jest.fn().mockResolvedValue({ data: [offer] });
  const container = {
    resolve: jest.fn().mockReturnValue({ graph }),
  } as unknown as MedusaContainer;
  return { offer, graph, container };
}

it("keeps existing sellers active and rejects malformed pause settings", () => {
  expect(pausedProducts(null)).toEqual([]);
  expect(pausedProducts({})).toEqual([]);
  expect(() => pausedProducts({ [PAUSED_PRODUCTS_KEY]: true })).toThrow();
});

it("blocks a paused product without mutating its offer", async () => {
  const { offer, container } = fixture();
  const original = JSON.stringify(offer);
  await expect(assertOffersNotPaused(container, [offer.id])).rejects.toThrow(
    "pausado",
  );
  expect(JSON.stringify(offer)).toBe(original);
});

it("allows purchases again after removing the product from the pause list", async () => {
  const { offer, container } = fixture();
  offer.seller.metadata[PAUSED_PRODUCTS_KEY] = [];
  await expect(
    assertOffersNotPaused(container, [offer.id]),
  ).resolves.toBeUndefined();
});

it("does not block another seller of the same shared product", async () => {
  const { offer, graph, container } = fixture();
  graph.mockResolvedValue({
    data: [
      { ...offer, id: "offer_b", seller: { id: "seller_b", metadata: {} } },
    ],
  });
  await expect(
    assertOffersNotPaused(container, ["offer_b"]),
  ).resolves.toBeUndefined();
  expect(graph).toHaveBeenCalledWith(
    expect.objectContaining({ filters: { id: ["offer_b"] } }),
    { cache: { enable: false } },
  );
});

it("rechecks existing carts against current pause settings", async () => {
  const { graph, container } = fixture();
  graph.mockResolvedValueOnce({
    data: [
      {
        id: "cart_a",
        completed_at: null,
        items: [{ offer: { id: "offer_a" } }],
      },
    ],
  });
  await expect(
    assertCartProductsNotPaused(container, "cart_a"),
  ).rejects.toThrow("pausado");
});

it("does not invalidate completed orders", async () => {
  const { graph, container } = fixture();
  graph.mockResolvedValueOnce({
    data: [{ id: "cart_a", completed_at: "2026-09-08", items: [] }],
  });
  await expect(
    assertCartProductsNotPaused(container, "cart_a"),
  ).resolves.toBeUndefined();
  expect(graph).toHaveBeenCalledTimes(1);
});

it.each([1, 2])(
  "allows lowering or keeping quantity (%s) while paused",
  async (quantity) => {
    const { graph, container } = fixture();
    graph.mockResolvedValueOnce({
      data: [
        {
          id: "cart_a",
          items: [{ id: "item_a", quantity: 2, offer: { id: "offer_a" } }],
        },
      ],
    });
    await expect(
      assertCartLineIncreaseNotPaused(container, "cart_a", "item_a", quantity),
    ).resolves.toBeUndefined();
    expect(graph).toHaveBeenCalledTimes(1);
  },
);

it("blocks increasing a paused line", async () => {
  const { graph, container } = fixture();
  graph.mockResolvedValueOnce({
    data: [
      {
        id: "cart_a",
        items: [{ id: "item_a", quantity: 2, offer: { id: "offer_a" } }],
      },
    ],
  });
  await expect(
    assertCartLineIncreaseNotPaused(container, "cart_a", "item_a", 3),
  ).rejects.toThrow("pausado");
});

it("allows removal without checking paused products", async () => {
  const { graph, container } = fixture();
  await expect(
    assertCartLineIncreaseNotPaused(container, "cart_a", "item_a", 0),
  ).resolves.toBeUndefined();
  expect(graph).not.toHaveBeenCalled();
});

it("does not resolve a line from a different cart", async () => {
  const { graph, container } = fixture();
  graph.mockResolvedValueOnce({ data: [{ id: "cart_a", items: [] }] });
  await expect(
    assertCartLineIncreaseNotPaused(container, "cart_a", "foreign_item", 3),
  ).rejects.toThrow("not found");
  expect(graph).toHaveBeenCalledTimes(1);
});
