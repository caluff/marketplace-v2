import { getFavoriteProductIds, MAX_FAVORITES, prepareFavoriteProductIds } from "../customer-favorites";
import { StoreUpdateCustomerFavorite } from "../../api/store/customers/me/favorites/middlewares";

describe("customer favorites", () => {
  it("keeps favorites unique when adding the same product again", () => {
    const metadata = { account_favorite_product_ids: ["prod_first"] };
    expect(prepareFavoriteProductIds(metadata, "prod_first", true, true)).toEqual(["prod_first"]);
    expect(prepareFavoriteProductIds(metadata, "prod_second", true, true)).toEqual(["prod_first", "prod_second"]);
    expect(metadata.account_favorite_product_ids).toEqual(["prod_first"]);
  });

  it("allows removing deleted products and is idempotent", () => {
    const metadata = { account_favorite_product_ids: ["prod_deleted", "prod_kept"] };
    expect(prepareFavoriteProductIds(metadata, "prod_deleted", false, false)).toEqual(["prod_kept"]);
    expect(prepareFavoriteProductIds(metadata, "prod_absent", false, false)).toEqual(["prod_deleted", "prod_kept"]);
  });

  it("rejects adding an unavailable product", () => {
    expect(() => prepareFavoriteProductIds({}, "prod_unpublished", true, false)).toThrow("no longer available");
  });

  it("enforces capacity while allowing removal and already saved products", () => {
    const ids = Array.from({ length: MAX_FAVORITES }, (_, index) => `prod_${index}`);
    const metadata = { account_favorite_product_ids: ids };
    expect(() => prepareFavoriteProductIds(metadata, "prod_extra", true, true)).toThrow("500");
    expect(prepareFavoriteProductIds(metadata, "prod_0", true, true)).toHaveLength(MAX_FAVORITES);
    expect(prepareFavoriteProductIds(metadata, "prod_0", false, true)).toHaveLength(MAX_FAVORITES - 1);
  });

  it("ignores malformed saved metadata", () => {
    expect(getFavoriteProductIds(null)).toEqual([]);
    expect(getFavoriteProductIds({ account_favorite_product_ids: "prod_one" })).toEqual([]);
    expect(getFavoriteProductIds({ account_favorite_product_ids: ["prod_valid", "prod_valid", "cus_wrong", null, 1, "prod_", "prod_/bad"] })).toEqual(["prod_valid"]);
  });

  it("rejects attempts to supply another customer's ID or malformed state", () => {
    expect(StoreUpdateCustomerFavorite.safeParse({ product_id: "prod_one", saved: true, customer_id: "cus_other" }).success).toBe(false);
    expect(StoreUpdateCustomerFavorite.safeParse({ product_id: "prod_one", saved: "false" }).success).toBe(false);
    expect(StoreUpdateCustomerFavorite.safeParse({ product_id: "cus_other", saved: true }).success).toBe(false);
  });
});
