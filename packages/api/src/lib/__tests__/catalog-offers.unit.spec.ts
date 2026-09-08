import type { MedusaContainer } from "@medusajs/framework/types";
import { FeatureFlag } from "@medusajs/framework/utils";
import type { CreateOfferDTO } from "@mercurjs/types";
import {
  validateCombinations,
  validateCatalogMutation,
} from "../catalog/product-validation";
import {
  validateOfferCreation,
  validateOfferInventory,
  validateOfferUpdates,
} from "../catalog/offer-validation";
import { requireSellerWarehouse } from "../vendor-warehouse/access";
import { assertSellerCatalogImages } from "../catalog-media/access";
import { readCatalogOptions } from "../catalog/product-options";

jest.mock("../vendor-warehouse/access", () => ({
  requireSellerWarehouse: jest.fn(),
}));
jest.mock("../catalog-media/access", () => ({
  assertSellerCatalogImages: jest.fn(),
}));
type QueryInput = {
  entity: string;
  filters?: Record<string, unknown>;
  fields?: string[];
};
function containerFor(overrides: Partial<Record<string, unknown[]>> = {}) {
  const rows: Partial<Record<string, unknown[]>> = {
    product_variant: [
      { id: "var_1", product: { id: "prod_1", status: "published" } },
    ],
    shipping_profile_seller: [{ shipping_profile_id: "sp_1" }],
    seller: [{ id: "seller_1", status: "open" }],
    product_seller: [],
    offer: [
      {
        id: "offer_1",
        seller_id: "seller_1",
        variant_id: "var_1",
        shipping_profile_id: "sp_1",
        inventory_items: [{ id: "item_1" }],
      },
    ],
    inventory_item_seller: [{ inventory_item_id: "item_1" }],
    inventory_level: [{ inventory_item_id: "item_1", location_id: "loc_1" }],
    ...overrides,
  };
  const graph = jest.fn(async (input: QueryInput) => ({
    data: rows[input.entity] ?? [],
  }));
  return {
    container: { resolve: () => ({ graph }) } as unknown as MedusaContainer,
    graph,
  };
}

function multiSellerContainer() {
  const rows: Record<string, Record<string, unknown>[]> = {
    offer: [1, 2].map((id) => ({ id: `offer_${id}`, seller_id: `seller_${id}`, variant_id: `var_${id}`, shipping_profile_id: `sp_${id}` })),
    product_variant: [1, 2].map((id) => ({ id: `var_${id}`, product: { id: `prod_${id}`, status: "published" } })),
    shipping_profile_seller: [1, 2].map((id) => ({ seller_id: `seller_${id}`, shipping_profile_id: `sp_${id}` })),
    seller: [1, 2].map((id) => ({ id: `seller_${id}`, status: "open" })),
    product_seller: [1, 2].map((id) => ({ product_id: `prod_${id}`, seller_id: `seller_${id}` })),
  };
  const graph = jest.fn(async (input: QueryInput) => ({
    data: (rows[input.entity] ?? []).filter((row) =>
      Object.entries(input.filters ?? {}).every(([key, value]) =>
        Array.isArray(value) ? value.includes(row[key]) : row[key] === value,
      ),
    ),
  }));
  return { container: { resolve: () => ({ graph }) } as unknown as MedusaContainer, graph };
}
const offer = (): CreateOfferDTO => ({
  seller_id: "seller_1",
  created_by: "member_1",
  sku: "SELLER-SKU",
  variant_id: "var_1",
  shipping_profile_id: "sp_1",
  prices: [{ amount: 49.99, currency_code: "usd" }],
  inventory_items: [
    { stock_levels: [{ location_id: "loc_1", stocked_quantity: 4 }] },
  ],
});

beforeEach(() => {
  jest.mocked(requireSellerWarehouse).mockResolvedValue("loc_1");
  jest.mocked(assertSellerCatalogImages).mockResolvedValue(undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("native offer workflow guards", () => {
  it("accepts approved shared catalog with the canonical seller warehouse and display-unit price", async () => {
    const { container, graph } = containerFor();
    const input = offer();
    await validateOfferCreation(container, [input]);
    expect(input.prices[0].amount).toBe(49.99);
    expect(requireSellerWarehouse).toHaveBeenCalledWith(container, "seller_1");
    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "shipping_profile_seller",
        filters: { seller_id: "seller_1", shipping_profile_id: ["sp_1"] },
      }),
      expect.anything(),
    );
  });
  it.each([
    {
      product_variant: [
        { id: "var_1", product: { id: "prod_1", status: "proposed" } },
      ],
    },
    { product_seller: [{ product_id: "prod_1", seller_id: "seller_other" }] },
    { shipping_profile_seller: [] },
    { seller: [{ status: "suspended" }] },
  ])(
    "rejects unpublished, restricted, foreign-profile and inactive-seller resources",
    async (overrides) => {
      await expect(
        validateOfferCreation(containerFor(overrides).container, [offer()]),
      ).rejects.toThrow();
    },
  );
  it("rejects cross-seller batches and nested foreign warehouse IDs", async () => {
    const { container } = containerFor();
    await expect(
      validateOfferCreation(container, [
        offer(),
        { ...offer(), seller_id: "seller_other" },
      ]),
    ).rejects.toThrow();
    const input = offer();
    input.inventory_items[0].stock_levels![0].location_id = "loc_other";
    await expect(validateOfferCreation(container, [input])).rejects.toThrow();
    jest
      .mocked(requireSellerWarehouse)
      .mockRejectedValueOnce(new Error("warehouse conflict"));
    await expect(validateOfferCreation(container, [offer()])).rejects.toThrow(
      "warehouse conflict",
    );
  });
  it("validates update profiles and inventory batch ownership to prevent native bypasses", async () => {
    await expect(
      validateOfferUpdates(
        containerFor({ shipping_profile_seller: [] }).container,
        [{ id: "offer_1", shipping_profile_id: "foreign" }],
      ),
    ).rejects.toThrow();
    await expect(
      validateOfferInventory(
        containerFor({ inventory_item_seller: [] }).container,
        { offer_id: "offer_1", create: [{ inventory_item_id: "item_other" }] },
      ),
    ).rejects.toThrow();
    await expect(
      validateOfferInventory(
        containerFor({ inventory_level: [{ location_id: "loc_other" }] })
          .container,
        { offer_id: "offer_1", create: [{ inventory_item_id: "item_1" }] },
      ),
    ).rejects.toThrow();
  });
  it("batches eligibility reads independently of the number of offers without mixing product restrictions", async () => {
    const variants = Array.from({ length: 30 }, (_, index) => ({
      id: `var_${index}`,
      product: { id: `prod_${index}`, status: "published" },
    }));
    const inputs = variants.map((variant) => ({
      ...offer(),
      variant_id: variant.id,
    }));
    const { container, graph } = containerFor({ product_variant: variants });
    await validateOfferCreation(container, inputs);
    expect(graph).toHaveBeenCalledTimes(4);
    expect(
      graph.mock.calls.filter(([input]) => input.entity === "seller"),
    ).toHaveLength(1);
    await expect(
      validateOfferCreation(
        containerFor({
          product_variant: variants,
          product_seller: [
            { product_id: "prod_0", seller_id: "seller_1" },
            { product_id: "prod_29", seller_id: "seller_other" },
          ],
        }).container,
        inputs,
      ),
    ).rejects.toThrow("unavailable");
  });
  it("does not accept a missing variant just because another variant in the batch is published", async () => {
    await expect(
      validateOfferCreation(containerFor().container, [
        offer(),
        { ...offer(), variant_id: "missing" },
      ]),
    ).rejects.toThrow("unavailable");
  });
  it("batches existing offer updates and fails closed on a missing offer", async () => {
    const { container, graph } = containerFor({
      offer: [
        {
          id: "offer_1",
          seller_id: "seller_1",
          variant_id: "var_1",
          shipping_profile_id: "sp_1",
        },
        {
          id: "offer_2",
          seller_id: "seller_1",
          variant_id: "var_1",
          shipping_profile_id: "sp_1",
        },
      ],
    });
    await validateOfferUpdates(container, [
      { id: "offer_1" },
      { id: "offer_2" },
    ]);
    expect(graph).toHaveBeenCalledTimes(5);
    await expect(
      validateOfferUpdates(container, [{ id: "missing" }]),
    ).rejects.toThrow("unavailable");
  });

  it("keeps each seller's profile, variants and restrictions scoped in a multi-seller workflow batch", async () => {
    const { container, graph } = multiSellerContainer();
    await validateOfferUpdates(container, [
      { id: "offer_1", shipping_profile_id: "sp_1" },
      { id: "offer_2", shipping_profile_id: "sp_2" },
    ]);
    expect(graph).toHaveBeenCalledTimes(9);
    expect(graph).toHaveBeenNthCalledWith(1, expect.objectContaining({ entity: "offer", filters: { id: ["offer_1", "offer_2"] } }), { cache: { enable: false } });
    for (const id of [1, 2]) {
      expect(graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "shipping_profile_seller", filters: { seller_id: `seller_${id}`, shipping_profile_id: [`sp_${id}`] } }), { cache: { enable: false } });
      expect(graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "product_variant", filters: { id: [`var_${id}`] } }), { cache: { enable: false } });
      expect(graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "product_seller", filters: { product_id: [`prod_${id}`] } }), { cache: { enable: false } });
    }
  });

  it.each([1, 2])("rejects seller %s using the other seller's profile even though both appear in the batch", async (foreignProfileSeller) => {
    const { container, graph } = multiSellerContainer();
    await expect(validateOfferUpdates(container, [1, 2].map((id) => ({
      id: `offer_${id}`,
      shipping_profile_id: `sp_${id === foreignProfileSeller ? 3 - id : id}`,
    })))).rejects.toThrow("unavailable seller resources");
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({
      entity: "shipping_profile_seller",
      filters: { seller_id: `seller_${foreignProfileSeller}`, shipping_profile_id: [`sp_${3 - foreignProfileSeller}`] },
    }), { cache: { enable: false } });
  });
});

describe("catalog mutation validation", () => {
  beforeEach(() => {
    jest.spyOn(FeatureFlag, "isFeatureEnabled").mockReturnValue(true);
  });
  it("loads referenced attributes once and still validates every selected value", async () => {
    const attrs = Array.from({ length: 20 }, (_, index) => ({
      id: `attr_${index}`,
      name: `Attribute ${index}`,
      is_active: true,
      product_id: null,
      is_variant_axis: false,
      values: [{ id: `value_${index}`, name: "value" }],
    }));
    const body = {
      status: "proposed",
      attributes: attrs.map((attr) => ({
        id: attr.id,
        value_ids: [attr.values[0].id],
      })),
      variants: [{ title: "Unique", sku: "MASTER", options: {} }],
    };
    const { container, graph } = containerFor({ product_attribute: attrs });
    await validateCatalogMutation(container, {
      seller_id: "seller_1",
      mode: "create",
      body,
    });
    expect(
      graph.mock.calls.filter(
        ([input]) => input.entity === "product_attribute",
      ),
    ).toHaveLength(1);
    body.attributes[19].value_ids = ["value_0"];
    await expect(
      validateCatalogMutation(container, {
        seller_id: "seller_1",
        mode: "create",
        body,
      }),
    ).rejects.toThrow("another attribute");
  });
  it("limits shared option values to the product selection and rejects foreign scoped attributes", async () => {
    const { container } = containerFor({
      product_option: [
        {
          id: "opt_1",
          title: "Size",
          values: [
            { id: "val_s", value: "S" },
            { id: "val_m", value: "M" },
          ],
        },
      ],
      product: [
        {
          product_attribute_values: [
            {
              product_option_value_id: "val_s",
              attribute: { product_option_id: "opt_1" },
            },
          ],
        },
      ],
      product_attribute: [
        { id: "attr_other", is_active: true, product_id: "prod_other" },
      ],
    });
    expect(
      (await readCatalogOptions(container, "prod_1")).options[0].values,
    ).toEqual([{ id: "val_s", value: "S" }]);
    await expect(
      validateCatalogMutation(container, {
        seller_id: "seller_1",
        mode: "create",
        body: {
          status: "proposed",
          attributes: [{ id: "attr_other" }],
          variants: [{ title: "Unique", sku: "MASTER", options: {} }],
        },
      }),
    ).rejects.toThrow("unavailable");
  });
  it("rejects duplicate combinations and unsupported option values", () => {
    const axes = [{ title: "Size", values: ["S", "M"] }];
    expect(() =>
      validateCombinations(axes, [
        { options: { Size: "S" } },
        { options: { Size: "S" } },
      ]),
    ).toThrow("Duplicate");
    expect(() =>
      validateCombinations(axes, [{ options: { Size: "L" } }]),
    ).toThrow("existing value");
    expect(() =>
      validateCombinations(axes, [
        { options: { Size: "S" } },
        { options: { Size: "M" } },
      ]),
    ).not.toThrow();
  });
  it("refuses native top-level variant edits which would be silently ignored", async () => {
    await expect(
      validateCatalogMutation(containerFor().container, {
        seller_id: "seller_1",
        mode: "update",
        body: { variants: [{ id: "var_1" }] },
      }),
    ).rejects.toThrow("moderated attribute and variant endpoints");
  });
  it("requires moderation and rejects arbitrary image URLs and foreign categories", async () => {
    const { container } = containerFor();
    jest
      .mocked(assertSellerCatalogImages)
      .mockRejectedValueOnce(new Error("Image ownership required"));
    await expect(
      validateCatalogMutation(container, {
        seller_id: "seller_1",
        mode: "update",
        body: { images: [{ url: "https://other.invalid/a.png" }] },
      }),
    ).rejects.toThrow("ownership");
    await expect(
      validateCatalogMutation(container, {
        seller_id: "seller_1",
        mode: "update",
        body: { categories: [{ id: "pcat_foreign" }] },
      }),
    ).rejects.toThrow("unavailable");
    jest.mocked(FeatureFlag.isFeatureEnabled).mockReturnValue(false);
    await expect(
      validateCatalogMutation(container, {
        seller_id: "seller_1",
        mode: "update",
        body: { title: "title" },
      }),
    ).rejects.toThrow("moderation");
  });
  it("uses server-selected image ownership and discards a client product_id during creation", async () => {
    const { container } = containerFor();
    await validateCatalogMutation(container, {
      seller_id: "seller_1",
      mode: "create",
      body: {
        status: "proposed",
        product_id: "foreign_product",
        variant_context: true,
        variant_id: "foreign_variant",
        variants: [{ title: "Unique", sku: "MASTER", options: {} }],
        images: [],
      },
    });
    expect(assertSellerCatalogImages).toHaveBeenLastCalledWith(
      container,
      "seller_1",
      expect.objectContaining({
        product_id: undefined,
        variant_context: false,
        variant_id: undefined,
      }),
    );
  });
  it("rejects another product's variant and attribute IDs", async () => {
    const { container } = containerFor({
      product: [
        {
          id: "prod_1",
          product_attribute_values: [
            { id: "value_1", attribute: { id: "attr_1" } },
          ],
        },
      ],
      product_variant: [{ id: "var_1" }],
      product_option: [],
    });
    await expect(
      validateCatalogMutation(container, {
        seller_id: "seller_1",
        mode: "variant",
        product_id: "prod_1",
        variant_id: "var_other",
        body: { title: "title" },
      }),
    ).rejects.toThrow("belong");
    await expect(
      validateCatalogMutation(container, {
        seller_id: "seller_1",
        mode: "attributes",
        product_id: "prod_1",
        body: { update: [{ id: "attr_other", add: [{ value: "S" }] }] },
      }),
    ).rejects.toThrow("attached");
  });
});
