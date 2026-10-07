import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthorizedVendor } from "../workspace/operations";
import { savePresentationChanges } from "../offers/save-presentation";
import { catalogOperations } from "./operations";
import {
  productSpecifications,
  specificationDraft,
  variantSpecifications,
} from "./product-specifications";
import { createCatalogBody } from "./validation";

test("empty variant attributes remain unspecified and clear only submitted fields on update", () => {
  const empty = { material: "", weight: "", length: "", width: "", height: "" };
  assert.deepEqual(variantSpecifications(empty, "create"), {});
  assert.deepEqual(
    variantSpecifications({ material: "PETG", weight: "80.5" }, "create"),
    {
      material: "PETG",
      weight: 80.5,
    },
  );
  assert.deepEqual(variantSpecifications({}, "update"), {});
  assert.deepEqual(variantSpecifications(empty, "update"), {
    material: null,
    weight: null,
    length: null,
    width: null,
    height: null,
  });
});

test("variant measurements reject invalid values instead of silently dropping them", () => {
  for (const field of ["weight", "length", "width", "height"]) {
    for (const value of [
      "0",
      "-1",
      "NaN",
      "Infinity",
      "2mm",
      "1e2",
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      assert.throws(() => variantSpecifications({ [field]: value }, "create"));
    }
  }
  assert.throws(() => variantSpecifications({ material: 123 }, "create"));
  assert.throws(() =>
    variantSpecifications({ material: "x".repeat(201) }, "create"),
  );
  assert.throws(() =>
    variantSpecifications({ weight: { value: 80 } }, "create"),
  );
});

test("physical and customs attributes are independent native fields", () => {
  assert.deepEqual(
    specificationDraft({
      material: "PLA",
      origin_country: "us",
      hs_code: "3926",
      mid_code: "USMAKER123",
    }),
    {
      material: "PLA",
      origin_country: "us",
      hs_code: "3926",
      mid_code: "USMAKER123",
      weight: "",
      length: "",
      width: "",
      height: "",
    },
  );
  const fields = new FormData();
  fields.set("origin_country", " us ");
  fields.set("hs_code", " 3926 ");
  fields.set("mid_code", " USMAKER123 ");
  assert.deepEqual(productSpecifications(fields, "create"), {
    origin_country: "us",
    hs_code: "3926",
    mid_code: "USMAKER123",
  });
  assert.deepEqual(
    variantSpecifications(
      { origin_country: "ca", hs_code: "", mid_code: null },
      "create",
    ),
    { origin_country: "ca" },
  );
  assert.deepEqual(
    variantSpecifications(
      { origin_country: "", hs_code: "", mid_code: null },
      "update",
    ),
    { origin_country: null, hs_code: null, mid_code: null },
  );
  assert.deepEqual(variantSpecifications({}, "update"), {});
});

test("customs attributes reject nontext payloads and overly long values", () => {
  for (const field of ["origin_country", "hs_code", "mid_code"]) {
    for (const value of [123, { code: "invalid" }, "x".repeat(201)])
      assert.throws(() => variantSpecifications({ [field]: value }, "create"));
  }
});

test("creating a product forwards independent variant specifications through the native payload", () => {
  const form = new FormData();
  form.set("status", "proposed");
  form.set("title", "Maceta impresa en 3D");
  form.set("material", "PLA");
  form.set("weight", "120");
  form.set("categories_present", "true");
  form.set("category_id", "pcat_home");
  form.set(
    "axes",
    JSON.stringify([{ title: "Tamaño", values: ["Pequeña", "Grande"] }]),
  );
  form.set(
    "variants",
    JSON.stringify([
      {
        title: "Pequeña",
        sku: "MACETA-S",
        options: { Tamaño: "Pequeña" },
        specifications: { material: "", weight: "" },
      },
      {
        title: "Grande",
        sku: "MACETA-L",
        options: { Tamaño: "Grande" },
        specifications: { material: "PETG", weight: "240", width: "130.5" },
      },
    ]),
  );
  form.set(
    "images",
    JSON.stringify([{ url: "http://localhost:9000/static/maceta.jpg" }]),
  );
  const body = createCatalogBody(form);
  assert.equal(body.material, "PLA");
  assert.equal(body.weight, 120);
  assert.equal(body.status, "proposed");
  assert.deepEqual(body.variants, [
    { title: "Pequeña", sku: "MACETA-S", options: { Tamaño: "Pequeña" } },
    {
      title: "Grande",
      sku: "MACETA-L",
      options: { Tamaño: "Grande" },
      material: "PETG",
      weight: 240,
      width: 130.5,
    },
  ]);
});

function operationsFixture() {
  const calls: { path: string; body?: unknown; headers?: unknown }[] = [];
  const authorized = {
    membership: {
      member: { is_active: true },
      seller: { id: "sel_owner", status: "open" },
    },
    sdk: {
      client: {
        async fetch(
          path: string,
          options: { body?: unknown; headers?: unknown },
        ) {
          calls.push({ path, body: options.body, headers: options.headers });
          if (path.endsWith("/catalog-options"))
            return {
              options: [
                { title: "__default__", values: [{ value: "__default__" }] },
              ],
              variants: [{ id: "variant_owner" }],
            };
          return { product_change: { status: "confirmed" } };
        },
      },
    },
  } as unknown as AuthorizedVendor;
  const form = new FormData();
  form.set("id", "prod_owner");
  form.set("variant_id", "variant_owner");
  form.set("title", "Única");
  form.set("master_sku", "MASTER-3D");
  form.set("option_0", "__default__");
  return { calls, form, operations: catalogOperations(async () => authorized) };
}

test("clearing an existing variant override sends null with its original SKU and seller scope", async () => {
  const { calls, form, operations } = operationsFixture();
  form.set("material", "");
  form.set("weight", "");
  form.set("height", "80");
  await operations.editVariant(form);
  assert.deepEqual(calls[1], {
    path: "/vendor/products/prod_owner/variants/variant_owner",
    headers: { "x-seller-id": "sel_owner" },
    body: {
      title: "Única",
      sku: "MASTER-3D",
      options: { __default__: "__default__" },
      material: null,
      weight: null,
      height: 80,
    },
  });
});

test("variant specifications cannot bypass ownership or numeric validation", async () => {
  const unrelated = operationsFixture();
  unrelated.form.set("variant_id", "variant_other");
  unrelated.form.set("weight", "50");
  await assert.rejects(
    unrelated.operations.editVariant(unrelated.form),
    /no pertenece/,
  );
  assert.equal(unrelated.calls.length, 1);
  const invalid = operationsFixture();
  invalid.form.set("weight", "-50");
  await assert.rejects(
    invalid.operations.editVariant(invalid.form),
    /mayor a cero/,
  );
  assert.equal(invalid.calls.length, 1);
});

test("a saved specification remains marked saved when an accompanying price change fails", async () => {
  const form = new FormData();
  form.set("change_variant", "true");
  form.set("change_offer", "true");
  form.set("weight", "240");
  const result = await savePresentationChanges(form, {
    variant: async (data) => {
      assert.equal(data.get("weight"), "240");
      return { status: "success", message: "Presentación guardada." };
    },
    offer: async () => ({
      status: "error",
      message: "El precio cambió. Recarga.",
    }),
  });
  assert.equal(result.status, "error");
  assert.equal(result.savedVariant, true);
  assert.equal(result.savedOffer, undefined);
});
