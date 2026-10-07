import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getLinkedVariantImages,
  getProductImageSources,
  getVariantImageSources,
} from "./variant-images";

test("variant image membership excludes general images and images of another variant", () => {
  const images = [
    { id: "general", url: "/general.jpg", rank: 0, variants: [] },
    {
      id: "small",
      url: "/small.jpg",
      rank: 1,
      variants: [{ id: "variant_small" }],
    },
    {
      id: "large",
      url: "/large.jpg",
      rank: 2,
      variants: [{ id: "variant_large" }],
    },
    {
      id: "shared",
      url: "/shared.jpg",
      rank: 3,
      variants: [{ id: "variant_small" }, { id: "variant_large" }],
    },
  ];
  assert.deepEqual(
    getLinkedVariantImages(images, "variant_small").map(({ id }) => id),
    ["small", "shared"],
  );
  assert.deepEqual(
    getLinkedVariantImages(images, "variant_large").map(({ id }) => id),
    ["large", "shared"],
  );
  assert.deepEqual(
    getLinkedVariantImages(images, "variant_without_images"),
    [],
  );
});

test("missing or malformed membership never assigns general photos to a variant", () => {
  const images = [
    { id: "unloaded", url: "/unloaded.jpg", rank: 0 },
    {
      id: "invalid",
      url: "/invalid.jpg",
      rank: 1,
      variants: [null, "variant_small", { id: 123 }],
    },
  ];
  assert.deepEqual(getLinkedVariantImages(images, "variant_small"), []);
  assert.deepEqual(getLinkedVariantImages(null, "variant_small"), []);
  assert.deepEqual(
    getVariantImageSources(
      ["/general.jpg"],
      {
        thumbnail: null,
        images: getLinkedVariantImages(images, "variant_small"),
      },
      2,
    ),
    ["/general.jpg"],
  );
});

test("multiple variants show only their own photos with thumbnail first and no duplicates", () => {
  assert.deepEqual(
    getVariantImageSources(
      ["/general.jpg", "/large-front.jpg"],
      {
        thumbnail: "/large-front.jpg",
        images: [
          { id: "img_front", url: "/large-front.jpg", rank: 1 },
          { id: "img_back", url: "/large-back.jpg", rank: 0 },
        ],
      },
      2,
    ),
    ["/large-front.jpg", "/large-back.jpg"],
  );
});

test("variants without usable images retain the product gallery", () => {
  const sources = ["/general-front.jpg", "/general-back.jpg"];
  assert.equal(getVariantImageSources(sources, undefined, 2), sources);
  assert.equal(
    getVariantImageSources(sources, { thumbnail: null, images: [] }, 2),
    sources,
  );
  assert.equal(
    getVariantImageSources(
      sources,
      {
        thumbnail: "javascript:alert(1)",
        images: [{ id: "img_invalid", url: "invalid", rank: 0 }],
      },
      2,
    ),
    sources,
  );
});

test("variant media follows the saved order without mutating backend data", () => {
  const images = [
    { id: "img_back", url: "/back.jpg", rank: 1 },
    { id: "img_front", url: "/front.jpg", rank: 0 },
  ];
  assert.deepEqual(getVariantImageSources([], { thumbnail: null, images }, 2), [
    "/front.jpg",
    "/back.jpg",
  ]);
  assert.equal(images[0].id, "img_back");
});

test("a single variant with only a thumbnail retains the general gallery", () => {
  assert.deepEqual(
    getVariantImageSources(
      ["/general.jpg"],
      {
        thumbnail: "/small.jpg",
        images: null,
      },
      1,
    ),
    ["/small.jpg", "/general.jpg"],
  );
});

test("a stale thumbnail cannot precede the selected variant photos", () => {
  assert.deepEqual(
    getVariantImageSources(
      ["/general.jpg"],
      {
        thumbnail: "/general.jpg",
        images: [{ id: "img_selected", url: "/selected.jpg", rank: 0 }],
      },
      2,
    ),
    ["/selected.jpg"],
  );
});

test("the general gallery excludes photos assigned exclusively to any variant", () => {
  const images = [
    { id: "general", url: "/general.jpg", rank: 0, variants: [] },
    {
      id: "small",
      url: "/small.jpg",
      rank: 1,
      variants: [{ id: "variant_small" }],
    },
    {
      id: "large",
      url: "/large.jpg",
      rank: 2,
      variants: [{ id: "variant_large" }],
    },
  ];
  const sources = getProductImageSources({
    thumbnail: "/small.jpg",
    images,
  });
  assert.deepEqual(sources, ["/general.jpg"]);
  assert.deepEqual(
    getVariantImageSources(
      sources,
      {
        thumbnail: null,
        images: getLinkedVariantImages(images, "variant_large"),
      },
      2,
    ),
    ["/large.jpg"],
  );
  assert.deepEqual(
    getVariantImageSources(
      sources,
      {
        thumbnail: null,
        images: getLinkedVariantImages(images, "variant_without_images"),
      },
      2,
    ),
    ["/general.jpg"],
  );
});

test("a single variant adds its own photos while retaining general product photos", () => {
  const images = [
    { id: "general", url: "/general.jpg", rank: 0, variants: [] },
    {
      id: "detail",
      url: "/detail.jpg",
      rank: 1,
      variants: [{ id: "variant_only" }],
    },
  ];
  assert.deepEqual(
    getVariantImageSources(
      getProductImageSources({ thumbnail: "/general.jpg", images }),
      {
        thumbnail: "/detail.jpg",
        images: getLinkedVariantImages(images, "variant_only"),
      },
      1,
    ),
    ["/detail.jpg", "/general.jpg"],
  );
});

test("a multiple-variant product falls back to general photos when no own photos are linked", () => {
  assert.deepEqual(
    getVariantImageSources(
      ["/general.jpg"],
      {
        thumbnail: "/stale-thumbnail.jpg",
        images: [],
      },
      2,
    ),
    ["/general.jpg"],
  );
});

test("a single variant does not duplicate a photo that is also general", () => {
  assert.deepEqual(
    getVariantImageSources(
      ["/detail.jpg", "/general.jpg"],
      {
        thumbnail: "/detail.jpg",
        images: [{ id: "detail", url: "/detail.jpg", rank: 0 }],
      },
      1,
    ),
    ["/detail.jpg", "/general.jpg"],
  );
});

test("general sources retain unloaded image relations and skip unusable sources", () => {
  assert.deepEqual(
    getProductImageSources({
      thumbnail: "/general.jpg",
      images: [
        { id: "general", url: "/general.jpg", rank: 0 },
        { id: "detail", url: "/detail.jpg", rank: 1 },
        { id: "invalid", url: "javascript:alert(1)", rank: 2 },
      ],
    }),
    ["/general.jpg", "/detail.jpg"],
  );
  assert.deepEqual(
    getProductImageSources({ thumbnail: null, images: null }),
    [],
  );
});
