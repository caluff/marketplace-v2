import {
  StoreCreateUsCustomer,
  StoreUpdateUsCustomer,
} from "../../api/store/customer-account/validators";

describe("protected customer favorites metadata", () => {
  it.each([
    ["create", StoreCreateUsCustomer],
    ["update", StoreUpdateUsCustomer],
  ])("rejects direct favorite changes through the %s customer schema", (_name, schema) => {
    for (const value of [["prod_one"], [], "", null]) {
      expect(schema.safeParse({ metadata: {
        account_favorite_product_ids: value,
        unrelated: "keep",
      } }).success).toBe(false);
    }
  });

  it("rejects clearing all customer metadata through profile updates", () => {
    expect(StoreUpdateUsCustomer.safeParse({ metadata: null }).success).toBe(false);
  });

  it.each([
    ["create", StoreCreateUsCustomer],
    ["update", StoreUpdateUsCustomer],
  ])("preserves unrelated metadata and optional metadata in the %s schema", (_name, schema) => {
    const metadata = { locale: "es", preference: { newsletter: false }, remove_me: "" };
    expect(schema.parse({ metadata }).metadata).toEqual(metadata);
    expect(schema.safeParse({ first_name: "Customer" }).success).toBe(true);
  });

  it("continues accepting null metadata on initial registration", () => {
    expect(StoreCreateUsCustomer.safeParse({ metadata: null }).success).toBe(true);
  });
});
