import { ProductChangeActionType } from "@mercurjs/types";
import {
  variantMediaActions,
  VariantMediaUpdateSchema,
} from "../variant-media";

const gallery = [
  { id: "img_general", url: "https://example.test/general.jpg", variants: [] },
  {
    id: "img_small",
    url: "https://example.test/small.jpg",
    variants: [{ id: "variant_small" }],
  },
  {
    id: "img_large",
    url: "https://example.test/large.jpg",
    variants: [{ id: "variant_large" }],
  },
];
const body = {
  variant: { title: "Small" },
  images: {
    ids: ["img_small"],
    uploads: [{ url: "https://example.test/new.jpg" }],
  },
};

it("stages new product image rows and variant links in one change while preserving the full existing gallery", () => {
  const actions = variantMediaActions(
    "prod_print",
    "variant_small",
    body,
    gallery,
  );
  expect(actions).toHaveLength(2);
  expect(actions[0]).toMatchObject({
    action: ProductChangeActionType.UPDATE,
    details: {
      field: "images",
      value: [
        ...gallery.map(({ id, url }) => ({ id, url })),
        { id: expect.stringMatching(/^img_/), url: body.images.uploads[0].url },
      ],
    },
  });
  const details = actions[0].details as { value: { id: string }[] };
  expect(actions[1]).toMatchObject({
    action: ProductChangeActionType.VARIANT_UPDATE,
    details: {
      variant_id: "variant_small",
      fields: {
        title: "Small",
        images: { add: [details.value[3].id], remove: [] },
      },
    },
  });
});

it("removes only this variant's explicit assignments, leaving inherited images and other variant links untouched", () => {
  const actions = variantMediaActions(
    "prod_print",
    "variant_small",
    { ...body, images: { ids: [], uploads: body.images.uploads } },
    gallery,
  );
  expect(actions[1]).toMatchObject({
    details: { fields: { images: { remove: ["img_small"] } } },
  });
});

it("rejects another product's image ids, duplicate media and attempts to bypass native variant fields", () => {
  expect(() =>
    variantMediaActions(
      "prod_print",
      "variant_small",
      { ...body, images: { ...body.images, ids: ["img_foreign"] } },
      gallery,
    ),
  ).toThrow();
  expect(() =>
    variantMediaActions(
      "prod_print",
      "variant_small",
      { ...body, images: { ...body.images, ids: ["img_small", "img_small"] } },
      gallery,
    ),
  ).toThrow();
  expect(() =>
    variantMediaActions(
      "prod_print",
      "variant_small",
      {
        ...body,
        images: {
          ...body.images,
          uploads: [...body.images.uploads, ...body.images.uploads],
        },
      },
      gallery,
    ),
  ).toThrow();
  expect(
    VariantMediaUpdateSchema.safeParse({
      ...body,
      variant: { images: { add: ["img_foreign"] } },
    }).success,
  ).toBe(false);
  expect(
    VariantMediaUpdateSchema.safeParse({
      ...body,
      images: {
        ...body.images,
        ids: gallery.flatMap((image) => [image.id, image.id]),
      },
    }).success,
  ).toBe(false);
});
