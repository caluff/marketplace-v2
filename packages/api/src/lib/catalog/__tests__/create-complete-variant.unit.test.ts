import { CreateCompleteVariantSchema } from "../create-complete-variant";
import { validateCatalogVariantFields } from "../product-validation";

const body = {
  variant: {
    title: "Large PLA",
    sku: "internal-variant",
    options: { Size: "Large" },
    material: "PLA",
    weight: 125,
  },
  images: { ids: [], uploads: [] },
  offer: { amount: 0, stocked_quantity: 0, shipping_profile_id: "sp_owned" },
};

it("accepts a complete draft with zero price and stock while retaining native attributes and new option values", () => {
  expect(CreateCompleteVariantSchema.parse(body)).toEqual(body);
  expect(validateCatalogVariantFields(body.variant)).toMatchObject({
    options: { Size: "Large" },
    material: "PLA",
    weight: 125,
  });
});

it("rejects malformed commercial drafts and excessive combined media", () => {
  for (const offer of [
    { ...body.offer, amount: -1 },
    { ...body.offer, amount: Infinity },
    { ...body.offer, stocked_quantity: 1.5 },
    { ...body.offer, stocked_quantity: -1 },
    { ...body.offer, shipping_profile_id: " " },
  ])
    expect(
      CreateCompleteVariantSchema.safeParse({ ...body, offer }).success,
    ).toBe(false);
  expect(
    CreateCompleteVariantSchema.safeParse({
      ...body,
      images: {
        ids: ["img_one"],
        uploads: Array.from({ length: 6 }, (_, index) => ({
          url: `https://example.test/${index}.jpg`,
        })),
      },
    }).success,
  ).toBe(false);
});

it("rejects forged proposal control fields, foreign owner descriptors and invalid physical attributes", () => {
  for (const extra of [
    { force_confirm: true },
    { seller_id: "sel_forged" },
    { initial_offer: { seller_id: "sel_forged" } },
  ])
    expect(
      CreateCompleteVariantSchema.safeParse({ ...body, ...extra }).success,
    ).toBe(false);
  expect(
    CreateCompleteVariantSchema.safeParse({
      ...body,
      variant: { ...body.variant, id: "variant_forged" },
    }).success,
  ).toBe(false);
  for (const variant of [
    { ...body.variant, weight: -10 },
    { ...body.variant, origin_country: "USA" },
    { ...body.variant, options: { Size: " " } },
  ])
    expect(() => validateCatalogVariantFields(variant)).toThrow();
});
