import assert from "node:assert/strict";
import { test } from "node:test";
import { variantMediaGroups } from "./variant-media-groups";

test("variant editor separates general photos from photos assigned to any variant", () => {
  const general = { id: "img_general", url: "/general.jpg" };
  const small = { id: "img_small", url: "/small.jpg" };
  const large = { id: "img_large", url: "/large.jpg" };
  const variant = { images: [small] };
  assert.deepEqual(
    variantMediaGroups(
      {
        images: [general, small, large],
        variants: [variant, { images: [large] }],
      },
      variant,
    ),
    { generalImages: [general], ownImages: [small] },
  );
});

test("single variant keeps its general gallery and editable own photos separate", () => {
  const general = { id: "img_general", url: "/general.jpg" };
  const own = { id: "img_own", url: "/own.jpg" };
  const variant = { images: [own] };
  assert.deepEqual(
    variantMediaGroups(
      { images: [general, own], variants: [variant] },
      variant,
    ),
    {
      generalImages: [general],
      ownImages: [own],
    },
  );
  assert.deepEqual(
    variantMediaGroups(
      { images: [general], variants: [{ images: [] }] },
      { images: [] },
    ),
    {
      generalImages: [general],
      ownImages: [],
    },
  );
});
