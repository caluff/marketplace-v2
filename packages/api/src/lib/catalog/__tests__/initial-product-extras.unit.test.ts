import {
  resolveInitialProductExtras,
  validateInitialProductExtras,
} from "../initial-product-extras";

const image = "https://example.invalid/product-blue.jpg";
const product = {
  variants: [{ sku: "MASTER-BLUE" }, { sku: "MASTER-RED" }],
  images: [{ url: image }],
};
const offer = (variant_sku: string) => ({
  variant_sku,
  amount: 12.75,
  stocked_quantity: 4,
  shipping_profile_id: "sp_own",
});

it("resolves offers and image links by persisted SKU regardless of variant order", () => {
  const extras = validateInitialProductExtras({
    ...product,
    additional_data: {
      initial_offers: [
        offer("MASTER-BLUE"),
        { ...offer("MASTER-RED"), amount: 0, stocked_quantity: 0 },
      ],
      initial_variant_images: [
        { variant_sku: "MASTER-BLUE", image_urls: [image] },
      ],
    },
  });
  expect(
    resolveInitialProductExtras(
      extras,
      [
        { id: "variant_red", sku: "MASTER-RED" },
        { id: "variant_blue", sku: "MASTER-BLUE" },
      ],
      [{ id: "image_blue", url: image }],
    ),
  ).toMatchObject({
    offers: [
      { variant_id: "variant_blue", amount: 12.75 },
      { variant_id: "variant_red", amount: 0, stocked_quantity: 0 },
    ],
    images: [{ variant_id: "variant_blue", add: ["image_blue"], remove: [] }],
  });
});

it("keeps additional_data optional and preserves unrelated native extension keys", () => {
  expect(validateInitialProductExtras(product)).toEqual({});
  expect(
    validateInitialProductExtras({
      ...product,
      additional_data: { extension_key: true },
    }),
  ).toEqual({});
});

it.each([
  { initial_offers: [offer("MASTER-BLUE")] },
  { initial_offers: [offer("MASTER-BLUE"), offer("MASTER-BLUE")] },
  { initial_offers: [offer("MASTER-BLUE"), offer("FOREIGN-SKU")] },
  {
    initial_offers: [
      offer("MASTER-BLUE"),
      { ...offer("MASTER-RED"), amount: -1 },
    ],
  },
  {
    initial_offers: [
      offer("MASTER-BLUE"),
      { ...offer("MASTER-RED"), amount: Infinity },
    ],
  },
  {
    initial_offers: [
      offer("MASTER-BLUE"),
      { ...offer("MASTER-RED"), stocked_quantity: 0.5 },
    ],
  },
  {
    initial_offers: [
      offer("MASTER-BLUE"),
      { ...offer("MASTER-RED"), stocked_quantity: Number.MAX_SAFE_INTEGER + 1 },
    ],
  },
  {
    initial_offers: [
      offer("MASTER-BLUE"),
      { ...offer("MASTER-RED"), seller_id: "forged" },
    ],
  },
  {
    initial_variant_images: [
      { variant_sku: "FOREIGN-SKU", image_urls: [image] },
    ],
  },
  {
    initial_variant_images: [
      {
        variant_sku: "MASTER-BLUE",
        image_urls: ["https://example.invalid/foreign.jpg"],
      },
    ],
  },
  {
    initial_variant_images: [
      { variant_sku: "MASTER-BLUE", image_urls: [image, image] },
    ],
  },
])(
  "rejects incomplete, forged or invalid initial product data: %j",
  (additional_data) => {
    expect(() =>
      validateInitialProductExtras({ ...product, additional_data }),
    ).toThrow();
  },
);

it("fails if native persistence has not produced the requested SKU or image", () => {
  const extras = validateInitialProductExtras({
    ...product,
    additional_data: {
      initial_variant_images: [
        { variant_sku: "MASTER-BLUE", image_urls: [image] },
      ],
    },
  });
  expect(() =>
    resolveInitialProductExtras(extras, [], [{ id: "image", url: image }]),
  ).toThrow("variant was not persisted");
  expect(() =>
    resolveInitialProductExtras(
      extras,
      [{ id: "variant", sku: "MASTER-BLUE" }],
      [],
    ),
  ).toThrow("image was not persisted");
});
