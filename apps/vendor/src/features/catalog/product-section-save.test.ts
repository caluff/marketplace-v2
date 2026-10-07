import assert from "node:assert/strict";
import { test } from "node:test";
import {
  vendorOperations,
  type AuthorizedVendor,
} from "../workspace/operations";
import { variantSpecifications } from "./product-specifications";

test("editing one product section leaves all omitted sections unchanged", async () => {
  const bodies: unknown[] = [];
  const authorized = {
    membership: {
      member: { is_active: true },
      seller: { id: "sel_owner", status: "open" },
    },
    sdk: {
      client: {
        async fetch(path: string, options: { body?: unknown }) {
          assert.equal(path, "/vendor/products/prod_owner");
          bodies.push(options.body);
          return { product_change: { status: "confirmed" } };
        },
      },
    },
  } as unknown as AuthorizedVendor;
  const operations = vendorOperations(async () => authorized);
  const attributes = new FormData();
  attributes.set("id", "prod_owner");
  attributes.set("weight", "80");
  await operations.editProduct(attributes);
  assert.deepEqual(bodies[0], { weight: 80 });
  const organization = new FormData();
  organization.set("id", "prod_owner");
  for (const marker of [
    "categories_present",
    "type_id_present",
    "collection_id_present",
    "tags_present",
    "discountable_present",
  ])
    organization.set(marker, "true");
  await operations.editProduct(organization);
  assert.deepEqual(bodies[1], {
    categories: [],
    type_id: null,
    collection_id: null,
    tags: [],
    discountable: false,
  });
});

test("native country attributes require a two-letter code", () => {
  assert.throws(
    () => variantSpecifications({ origin_country: "USA" }, "create"),
    /dos letras/,
  );
});

test("editing the unified gallery submits exactly the selected photos, including removal of assigned photos", async () => {
  let saved: unknown;
  const authorized = {
    membership: {
      member: { is_active: true },
      seller: { id: "sel_owner", status: "open" },
    },
    sdk: {
      client: {
        async fetch(
          path: string,
          options: { method?: string; body?: unknown },
        ) {
          if (path.endsWith("catalog-options"))
            return { variants: [{ images: [{ id: "img_variant" }] }] };
          if (options.method !== "POST")
            return {
              product: {
                images: [
                  {
                    id: "img_general",
                    url: "https://example.test/general.jpg",
                  },
                  {
                    id: "img_variant",
                    url: "https://example.test/variant.jpg",
                  },
                ],
              },
            };
          saved = options.body;
          return { product_change: { status: "confirmed" } };
        },
      },
    },
  } as unknown as AuthorizedVendor;
  const form = new FormData();
  form.set("id", "prod_owner");
  form.set(
    "images",
    JSON.stringify([{ url: "https://example.test/new-general.jpg" }]),
  );
  await vendorOperations(async () => authorized).editProduct(form);
  assert.deepEqual(saved, {
    images: [{ url: "https://example.test/new-general.jpg" }],
  });
  form.set("images", "[]");
  await vendorOperations(async () => authorized).editProduct(form);
  assert.deepEqual(saved, {
    images: [],
  });
  form.set(
    "images",
    JSON.stringify(
      Array.from({ length: 7 }, (_, index) => ({
        url: `https://example.test/${index}.jpg`,
      })),
    ),
  );
  await vendorOperations(async () => authorized).editProduct(form);
  assert.equal((saved as { images: unknown[] }).images.length, 7);
});
