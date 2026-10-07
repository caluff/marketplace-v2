import type { MedusaContainer } from "@medusajs/framework/types";
import { FeatureFlag } from "@medusajs/framework/utils";
import { validateCatalogMutation } from "../product-validation";
import { readCatalogOptions } from "../product-options";

jest.mock("../product-options", () => ({ readCatalogOptions: jest.fn() }));
jest.mock("../../catalog-media/access", () => ({
  assertSellerCatalogImages: jest.fn(),
}));

const graph = jest.fn();
const container = { resolve: () => ({ graph }) } as unknown as MedusaContainer;
const physicalFields = ["weight", "length", "width", "height"] as const;
const specifications = {
  material: "PLA",
  weight: 120.5,
  length: 12.5,
  width: 8,
  height: 15,
};

function productBody(variantSpecifications: object = {}) {
  return {
    title: "Printed vase",
    status: "proposed",
    ...specifications,
    attributes: [],
    variants: [{
      title: "One",
      sku: "MASTER-PRINTED-VASE",
      options: {},
      ...variantSpecifications,
    }],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(FeatureFlag, "isFeatureEnabled").mockReturnValue(true);
  graph.mockResolvedValue({ data: [{ id: "prod_vase" }] });
  jest.mocked(readCatalogOptions).mockResolvedValue({
    product: { id: "prod_vase", ...specifications },
    options: [],
    variants: [{ id: "variant_vase", sku: "MASTER-PRINTED-VASE" }],
  } as unknown as Awaited<ReturnType<typeof readCatalogOptions>>);
});

afterEach(() => jest.restoreAllMocks());

it("accepts fractional native physical overrides at product and variant creation", async () => {
  await expect(validateCatalogMutation(container, {
    seller_id: "seller_prints",
    mode: "create",
    body: productBody(specifications),
  })).resolves.toBeUndefined();
  jest.mocked(readCatalogOptions).mockResolvedValueOnce({
    product: { id: "prod_vase", ...specifications }, options: [], variants: [],
  } as unknown as Awaited<ReturnType<typeof readCatalogOptions>>);
  await expect(validateCatalogMutation(container, {
    seller_id: "seller_prints",
    product_id: "prod_vase",
    mode: "variant",
    body: { title: "Additional print", sku: "MASTER-OTHER", ...specifications },
  })).resolves.toBeUndefined();
});

it("preserves omission on create and nullable resets on edit for dynamic inheritance", async () => {
  const body = productBody();
  await expect(validateCatalogMutation(container, {
    seller_id: "seller_prints", mode: "create", body,
  })).resolves.toBeUndefined();
  expect(body.variants[0]).not.toHaveProperty("weight");

  const inherited = { material: null, weight: null, length: null, width: null, height: null };
  await expect(validateCatalogMutation(container, {
    seller_id: "seller_prints",
    product_id: "prod_vase",
    variant_id: "variant_vase",
    mode: "variant",
    body: inherited,
  })).resolves.toBeUndefined();
  expect(inherited.weight).toBeNull();
});

it.each(physicalFields)("rejects invalid %s in nested creation and variant edits", async field => {
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "15"])
    for (const input of [
      { seller_id: "seller_prints", mode: "create" as const, body: productBody({ [field]: value }) },
      { seller_id: "seller_prints", product_id: "prod_vase", variant_id: "variant_vase", mode: "variant" as const, body: { [field]: value } },
      { seller_id: "seller_prints", product_id: "prod_vase", mode: "update" as const, body: { [field]: value } },
    ]) await expect(validateCatalogMutation(container, input)).rejects.toMatchObject({ type: "invalid_data" });
});

it("rejects empty, oversized and non-text material while preserving native ownership checks", async () => {
  for (const material of ["   ", "x".repeat(201), 123])
    await expect(validateCatalogMutation(container, {
      seller_id: "seller_prints", mode: "create", body: productBody({ material }),
    })).rejects.toThrow();
  await expect(validateCatalogMutation(container, {
    seller_id: "seller_prints", product_id: "prod_vase", variant_id: "variant_foreign",
    mode: "variant", body: specifications,
  })).rejects.toThrow("Variant does not belong to this product.");
});
