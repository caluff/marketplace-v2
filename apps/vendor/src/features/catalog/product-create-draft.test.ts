import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createVariantDrafts,
  parseCatalogOptions,
  singleVariantDraft,
} from "./product-create-draft";
import { createCatalogBody } from "./validation";
import { createMasterSku } from "./master-sku";

test("option changes generate new combinations without losing edited titles and physical overrides", () => {
  const axes = parseCatalogOptions([
    { title: " Tamaño ", values: " Mini , Mediana, " },
    { title: "Material", values: "PLA, PETG" },
  ]);
  const initial = createVariantDrafts(axes, []);
  initial[0] = {
    ...initial[0],
    title: "Mini personalizada",
    specifications: {
      material: "",
      weight: "25",
      length: "40",
      width: "40",
      height: "45",
      origin_country: "",
      hs_code: "",
      mid_code: "",
    },
  };
  const next = createVariantDrafts([...axes].reverse(), initial);
  assert.equal(next.length, 4);
  assert.equal(next[0].title, "Mini personalizada");
  assert.equal(next[0].specifications?.weight, "25");
  const expanded = createVariantDrafts(
    [{ title: "Tamaño", values: ["Mini", "Mediana", "Grande"] }, axes[1]],
    next,
  );
  assert.equal(expanded.length, 6);
  assert.equal(expanded[0].title, "Mini personalizada");
  assert.equal(expanded[4].title, "Grande / PLA");
});

test("removing an option value removes its obsolete variants while preserving the others", () => {
  const initial = createVariantDrafts(
    [{ title: "Tamaño", values: ["Mini", "Mediana"] }],
    [],
  );
  initial[1].title = "Mediana personalizada";
  assert.deepEqual(
    createVariantDrafts([{ title: "Tamaño", values: ["Mediana"] }], initial),
    [initial[1]],
  );
});

test("long option values keep their full values and generate a valid variant title", () => {
  const axes = [
    { title: "Tamaño", values: ["A".repeat(100)] },
    { title: "Material", values: ["B".repeat(100)] },
  ];
  const variants = createVariantDrafts(axes, []);
  assert.equal(variants[0].title.length, 200);
  assert.equal(variants[0].options.Material.length, 100);
  const form = createForm();
  form.set("axes", JSON.stringify(axes));
  form.set("variants", JSON.stringify(variants));
  assert.equal(
    createCatalogBody(form, () => "MASTER-UNIQUE").variants?.length,
    1,
  );
});

test("incomplete, duplicate and excessive option combinations cannot advance", () => {
  assert.throws(() => createVariantDrafts([], []), /al menos una opción/);
  assert.throws(
    () =>
      createVariantDrafts(
        parseCatalogOptions([{ title: "", values: "PLA" }]),
        [],
      ),
    /Completa/,
  );
  assert.throws(
    () =>
      createVariantDrafts(
        parseCatalogOptions([{ title: "Material", values: "PLA, pla" }]),
        [],
      ),
    /repetirse/,
  );
  assert.throws(
    () =>
      createVariantDrafts(
        [
          {
            title: "Tamaño",
            values: Array.from({ length: 11 }, (_, at) => String(at)),
          },
          {
            title: "Material",
            values: Array.from({ length: 10 }, (_, at) => String(at)),
          },
        ],
        [],
      ),
    /100 combinaciones/,
  );
});

function createForm() {
  const form = new FormData();
  form.set("title", "Caja impresa en 3D");
  form.set("status", "proposed");
  form.set("categories_present", "true");
  form.set("category_id", "pcat_home");
  form.set(
    "images",
    JSON.stringify([{ url: "http://localhost:9000/static/caja.jpg" }]),
  );
  return form;
}

test("single variant mode produces the native simple product payload without option axes", () => {
  const form = createForm();
  form.set("axes", "[]");
  form.set("variants", JSON.stringify([singleVariantDraft("Caja impresa en 3D")]));
  const body = createCatalogBody(form, () => "MASTER-UNIQUE");
  assert.deepEqual(body.attributes, []);
  assert.deepEqual(body.variants, [
    { title: "Caja impresa en 3D", sku: "MASTER-UNIQUE", options: {} },
  ]);
  assert.equal(body.categories?.[0].id, "pcat_home");
});

test("the generated variant payload retains every combination and moderation requirements", () => {
  const form = createForm();
  const axes = parseCatalogOptions([
    { title: "Tamaño", values: "Mini, Mediana" },
  ]);
  form.set("axes", JSON.stringify(axes));
  form.set("variants", JSON.stringify(createVariantDrafts(axes, [])));
  const body = createCatalogBody(form, (_, index) => `MASTER-${index}`);
  assert.equal(body.variants?.length, 2);
  const attribute = body.attributes?.[0];
  assert.ok(attribute && "is_variant_axis" in attribute);
  assert.equal(attribute.is_variant_axis, true);
  assert.equal(body.status, "proposed");
  form.delete("categories_present");
  assert.throws(
    () => createCatalogBody(form, (_, index) => `MASTER-${index}`),
    /carguen las categorías/,
  );
});

test("each variant gets a distinct internal SKU without a seller supplied code", () => {
  const form = createForm();
  const axes = [{ title: "Tamaño", values: ["Mini", "Mediana"] }];
  const variants = createVariantDrafts(axes, []).map((variant) => ({
    title: variant.title,
    options: variant.options,
  }));
  form.set("axes", JSON.stringify(axes));
  form.set("variants", JSON.stringify(variants));
  const body = createCatalogBody(form, ({ title }) => createMasterSku(title));
  assert.equal(body.variants?.length, 2);
  const skus = body.variants!.map(({ sku }) => sku);
  assert.equal(new Set(skus).size, 2);
  for (const sku of skus) {
    assert.ok(sku);
    assert.ok(sku.length <= 100);
    assert.match(sku, /^[A-Z0-9-]+$/);
  }
});

test("native organization selections and an unchecked discount option reach the create payload", () => {
  const form = createForm();
  form.set("axes", "[]");
  form.set("variants", JSON.stringify([singleVariantDraft("Caja impresa en 3D")]));
  form.set("handle", "caja-3d");
  form.set("type_id", "ptyp_print");
  form.set("collection_id", "pcol_print");
  form.append("tag_id", "ptag_3d");
  form.set("discountable_present", "true");
  const body = createCatalogBody(form, () => "MASTER-UNIQUE");
  assert.equal(body.handle, "caja-3d");
  assert.equal(body.type_id, "ptyp_print");
  assert.equal(body.collection_id, "pcol_print");
  assert.deepEqual(body.tags, [{ id: "ptag_3d" }]);
  assert.equal(body.discountable, false);
  form.set("discountable", "true");
  assert.equal(
    createCatalogBody(form, () => "MASTER-UNIQUE").discountable,
    true,
  );
});

test("initial offers and variant photos use the generated SKU and display-unit prices", () => {
  const form = createForm();
  const axes = [{ title: "Tamaño", values: ["Mini", "Grande"] }];
  form.set("axes", JSON.stringify(axes));
  form.set("initial_offers_present", "true");
  form.set("shipping_profile_id", "sp_owner");
  form.set(
    "variants",
    JSON.stringify(
      createVariantDrafts(axes, []).map((variant, index) => ({
        ...variant,
        amount: index ? "15.50" : "0",
        stockedQuantity: index ? "12" : "0",
        imageIndexes: index ? [] : [0],
      })),
    ),
  );
  const body = createCatalogBody(form, (_, index) => `INTERNAL-${index}`);
  assert.deepEqual(body.additional_data, {
    initial_offers: [
      {
        variant_sku: "INTERNAL-0",
        amount: 0,
        stocked_quantity: 0,
        shipping_profile_id: "sp_owner",
      },
      {
        variant_sku: "INTERNAL-1",
        amount: 15.5,
        stocked_quantity: 12,
        shipping_profile_id: "sp_owner",
      },
    ],
    initial_variant_images: [
      {
        variant_sku: "INTERNAL-0",
        image_urls: ["http://localhost:9000/static/caja.jpg"],
      },
      { variant_sku: "INTERNAL-1", image_urls: [] },
    ],
  });
});

test("invalid prices, fractional stock and stale image indexes cannot be submitted", () => {
  for (const invalid of [
    { amount: "" },
    { stockedQuantity: "1.5" },
    { imageIndexes: [1] },
    { imageIndexes: [0, 0] },
  ]) {
    const form = createForm();
    form.set("axes", "[]");
    form.set("initial_offers_present", "true");
    form.set("shipping_profile_id", "sp_owner");
    form.set(
      "variants",
      JSON.stringify([
        {
          ...singleVariantDraft("Caja impresa en 3D"),
          amount: "8",
          stockedQuantity: "3",
          ...invalid,
        },
      ]),
    );
    assert.throws(() => createCatalogBody(form, () => "INTERNAL-0"));
  }
});
