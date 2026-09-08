import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import Medusa, { FetchError } from "@medusajs/js-sdk";
import type { SellerMemberDTO } from "@mercurjs/types";
import { scopedClient } from "../workspace/operations";
import { catalogCategories } from "./data";
import { createCatalogBody, variantCombinations } from "./validation";
import { validateCatalogImages } from "./media-validation";
import { prepareCatalogImages, type CatalogAttachment } from "./image-submission";

describe("unified product image submission", () => {
  it("retains successful uploads across a later failure and retries only remaining files", async () => {
    let attachments: CatalogAttachment[] = [
      { id: "existing", name: "Existing", url: "https://images.test/existing.png" },
      ...["a", "b"].map((id) => ({ id, name: id, url: `blob:${id}`, file: new File([new Uint8Array(3 * 1024 * 1024)], `${id}.png`) })),
    ];
    const calls: string[] = [];
    let fail = true;
    const upload = async (form: FormData) => {
      const name = (form.get("file") as File).name;
      calls.push(name);
      if (name === "b.png" && fail) return { error: "Temporal" };
      return { files: [{ id: name, url: `https://images.test/${name}` }] };
    };
    const save = (saved: CatalogAttachment) => { attachments = attachments.map((entry) => entry.id === saved.id ? saved : entry); };
    await assert.rejects(prepareCatalogImages(attachments, upload, save), /Temporal/);
    assert.equal(attachments[1].file, undefined);
    assert.ok(attachments[2].file);
    fail = false;
    assert.deepEqual(await prepareCatalogImages(attachments, upload, save), [
      { url: "https://images.test/existing.png" }, { url: "https://images.test/a.png" }, { url: "https://images.test/b.png" },
    ]);
    assert.deepEqual(calls, ["a.png", "b.png", "b.png"]);
    await prepareCatalogImages(attachments, upload, save);
    assert.equal(calls.length, 3, "retrying the product save must not re-upload stored images");
  });

  it("rejects malformed upload results without consuming the selected file", async () => {
    const attachment = { id: "a", name: "a", url: "blob:a", file: new File(["a"], "a.png") };
    let saved = false;
    await assert.rejects(prepareCatalogImages([attachment], async () => ({ files: [] }), () => { saved = true; }), /no devolvió/);
    assert.equal(saved, false);
  });

  it("groups six small images in one action and retains their selection order", async () => {
    const attachments = Array.from({ length: 6 }, (_, index) => ({ id: String(index), name: `${index}.png`, url: `blob:${index}`, file: new File([String(index)], `${index}.png`) }));
    let requests = 0;
    const saved: CatalogAttachment[] = [];
    const images = await prepareCatalogImages(attachments, async (form) => {
      requests++;
      const files = form.getAll("file") as File[];
      assert.equal(files.length, 6);
      assert.ok(files.reduce((size, file) => size + file.size, 0) <= 5 * 1024 * 1024);
      return { files: files.map((file) => ({ id: file.name, url: `https://images.test/${file.name}` })) };
    }, (attachment) => saved.push(attachment));
    assert.equal(requests, 1);
    assert.equal(saved.length, 6);
    assert.deepEqual(images.map(({ url }) => url), attachments.map(({ name }) => `https://images.test/${name}`));
  });

  it("rejects oversized selections before any upload and never accepts a partial batch", async () => {
    let requests = 0;
    const attachment = { id: "a", name: "a", url: "blob:a", file: new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.png") };
    await assert.rejects(prepareCatalogImages([attachment], async () => { requests++; return { files: [] }; }, () => {}), /5 MB/);
    assert.equal(requests, 0);
    let saved = 0;
    const pending = ["a", "b"].map((id) => ({ id, name: id, url: `blob:${id}`, file: new File([id], `${id}.png`) }));
    await assert.rejects(prepareCatalogImages(pending, async () => ({ files: [{ id: "a", url: "https://images.test/a.png" }] }), () => { saved++; }), /no devolvió/);
    assert.equal(saved, 0);
  });
});

function categoryHarness(
  respond: (query: Record<string, unknown> | undefined) => unknown,
) {
  const calls: Parameters<Medusa["client"]["fetch"]>[1][] = [];
  const sdk = new Medusa({
    baseUrl: "https://api.example.invalid",
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
  });
  sdk.client.fetch = async <T>(
    path: Parameters<Medusa["client"]["fetch"]>[0],
    init?: Parameters<Medusa["client"]["fetch"]>[1],
  ): Promise<T> => {
    assert.equal(path, "/vendor/product-categories");
    calls.push(init);
    return (await respond(init?.query)) as T;
  };
  return {
    calls,
    client: scopedClient({
      sdk,
      membership: {
        seller: { id: "seller_current", status: "open" },
        member: { is_active: true },
      } as SellerMemberDTO,
    }),
  };
}

describe("catalog category reads", () => {
  it("requests only published categories through the scoped no-store SDK and preserves all pages", async () => {
    const categories = Array.from({ length: 101 }, (_, index) => ({
      id: `pcat_${index}`,
      name: `Category ${index}`,
      is_active: true,
      is_internal: false,
    }));
    const context = categoryHarness((query) => ({
      product_categories: categories.slice(Number(query?.offset), Number(query?.offset) + 100),
      count: categories.length,
    }));
    assert.deepEqual(await catalogCategories(context.client), categories);
    assert.equal(context.calls.length, 2);
    for (const [index, call] of context.calls.entries()) {
      assert.deepEqual(call?.query, {
        limit: 100,
        offset: index * 100,
        fields: "id,name,is_active,is_internal",
        is_active: true,
        is_internal: false,
      });
      assert.deepEqual(call?.headers, { "x-seller-id": "seller_current" });
      assert.equal(call?.cache, "no-store");
      assert.equal(call?.method, undefined);
    }
  });

  it("defensively omits hidden records without ending pagination on a filtered-empty page", async () => {
    const visible = { id: "pcat_visible", is_active: true, is_internal: false };
    const context = categoryHarness((query) => ({
      product_categories: query?.offset === 0
        ? Array.from({ length: 100 }, () => ({ id: "pcat_hidden", is_active: false, is_internal: false }))
        : [visible, { id: "pcat_internal", is_active: true, is_internal: true }],
      count: 102,
    }));
    assert.deepEqual(await catalogCategories(context.client), [visible]);
    assert.equal(context.calls.length, 2);
  });

  it("stops on an empty response even if a concurrently changed count is nonzero", async () => {
    const context = categoryHarness(() => ({ product_categories: [], count: 10 }));
    assert.deepEqual(await catalogCategories(context.client), []);
    assert.equal(context.calls.length, 1);
  });

  it("propagates auth and service failures instead of treating them as an empty category list", async () => {
    for (const status of [401, 403, 503]) {
      const error = new FetchError("Unavailable", "Unavailable", status);
      const context = categoryHarness(() => { throw error; });
      await assert.rejects(catalogCategories(context.client), (caught) => caught === error);
      assert.equal(context.calls.length, 1);
    }
  });

  it("does not return partially loaded choices when a later page fails", async () => {
    const error = new Error("Next page unavailable");
    const context = categoryHarness((query) => {
      if (query?.offset === 100) throw error;
      return {
        product_categories: Array.from({ length: 100 }, () => ({ id: "pcat_1", is_active: true, is_internal: false })),
        count: 101,
      };
    });
    await assert.rejects(catalogCategories(context.client), (caught) => caught === error);
    assert.equal(context.calls.length, 2);
  });
});

function categoryFieldsHarness() {
  const exports = {} as typeof import("./category-fields");
  const nativeRequire = createRequire(import.meta.url);
  const source = ts.transpileModule(
    readFileSync(new URL("./category-fields.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  runInNewContext(source, {
    exports,
    require: (id: string) => {
      if (id === "./data") return { catalogCategories: () => assert.fail("Preloaded categories must not be fetched twice") };
      if (id === "../workspace/data") return { workspace: () => assert.fail("Preloaded categories already have an authorized scope") };
      if (id === "../workspace/components") return { DataError: ({ message }: { message: string }) => message };
      if (id === "@/components/ui/checkbox") return nativeRequire("../../components/ui/checkbox");
      if (id === "@/components/ui/label") return nativeRequire("../../components/ui/label");
      return nativeRequire(id);
    },
  });
  return exports.CategoryFields;
}

describe("preloaded category fields", () => {
  it("reuses the result and preserves selected categories and the successful-load marker", async () => {
    const fields = categoryFieldsHarness();
    const html = renderToStaticMarkup(await fields({
      selected: ["pcat_selected"],
      categories: Promise.resolve({ data: [
        { id: "pcat_selected", name: "Selected category" },
        { id: "pcat_unselected", name: "Unselected category" },
      ] as Awaited<ReturnType<typeof catalogCategories>> }),
    }));
    assert.match(html, /name="categories_present"/);
    assert.match(html, /checked=""/);
    assert.match(html, /data-slot="checkbox"/);
    assert.match(html, /name="category_id"/);
    assert.match(html, /value="pcat_selected"/);
    assert.match(html, /data-slot="label"/);
    assert.match(html, /Selected category/);
    const inputs = html.match(/<input\b[^>]*type="checkbox"[^>]*>/g) ?? [];
    assert.equal(inputs.length, 2);
    const submittedValues = inputs.filter((input) => /checked=""/.test(input))
      .map((input) => input.match(/value="([^"]*)"/)?.[1]);
    assert.deepEqual(submittedValues, ["pcat_selected"]);
  });

  it("keeps an error local without authorizing submission of an empty category selection", async () => {
    const fields = categoryFieldsHarness();
    const html = renderToStaticMarkup(await fields({ categories: Promise.resolve({ error: "Categories unavailable" }) }));
    assert.match(html, /Categories unavailable/);
    assert.doesNotMatch(html, /categories_present|category_id/);
  });

  it("waits only for the passed category result and resolves a successful empty state", async () => {
    const fields = categoryFieldsHarness();
    let resolve!: (result: { data: Awaited<ReturnType<typeof catalogCategories>> }) => void;
    const categories = new Promise<{ data: Awaited<ReturnType<typeof catalogCategories>> }>((done) => { resolve = done; });
    let completed = false;
    const pending = fields({ categories }).then((element) => { completed = true; return element; });
    await new Promise<void>((done) => setImmediate(done));
    assert.equal(completed, false);
    resolve({ data: [] });
    const html = renderToStaticMarkup(await pending);
    assert.match(html, /categories_present/);
    assert.match(html, /todavía no ha publicado categorías/);
    assert.doesNotMatch(html, /name="category_id"/);
  });
});

function productForm() {
  const form = new FormData();
  form.set("title", "Shirt");
  form.set("status", "proposed");
  form.set("categories_present", "true");
  form.set("axes", JSON.stringify([{ title: "Size", values: ["S", "M"] }]));
  form.set(
    "variants",
    JSON.stringify([
      { title: "Small", sku: "MASTER-S", options: { Size: "S" } },
      { title: "Medium", sku: "MASTER-M", options: { Size: "M" } },
    ]),
  );
  return form;
}
describe("catalog proposals", () => {
  it("creates native variant-axis attributes and separate master SKUs without top-level options", () => {
    const form = productForm();
    form.append("category_id", "pcat_clothing");
    form.set("offer_sku", "SELLER-SKU");
    const body = createCatalogBody(form);
    assert.deepEqual(body.attributes, [
      {
        title: "Size",
        values: ["S", "M"],
        type: "multi_select",
        is_variant_axis: true,
      },
    ]);
    assert.equal("options" in body, false);
    assert.equal(body.variants?.[0].sku, "MASTER-S");
    assert.deepEqual(body.categories, [{ id: "pcat_clothing" }]);
    assert.equal(body.status, "proposed");
  });
  it("generates missing master SKUs while preserving the proposed combinations", () => {
    const form = productForm();
    form.set(
      "variants",
      JSON.stringify([
        { title: "Small", sku: "", options: { Size: "S" } },
        { title: "Medium", sku: "", options: { Size: "M" } },
      ]),
    );
    const body = createCatalogBody(
      form,
      (variant, index) => `AUTO-${variant.options.Size}-${index + 1}`,
    );
    assert.deepEqual(
      body.variants?.map((variant) => variant.sku),
      ["AUTO-S-1", "AUTO-M-2"],
    );
  });
  it("rejects duplicates, missing combinations and repeated master SKUs", () => {
    assert.throws(() =>
      variantCombinations([{ title: "Size", values: ["S", "s"] }]),
    );
    assert.throws(() =>
      variantCombinations([
        { title: "Size", values: ["S"] },
        { title: "size", values: ["M"] },
      ]),
    );
    const form = productForm();
    form.set(
      "variants",
      JSON.stringify([{ title: "Small", sku: "M", options: { Size: "S" } }]),
    );
    assert.throws(() => createCatalogBody(form), /combinación/);
    form.set(
      "variants",
      JSON.stringify([
        { title: "Small", sku: "M", options: { Size: "S" } },
        { title: "Medium", sku: "M", options: { Size: "M" } },
      ]),
    );
    assert.throws(() => createCatalogBody(form), /SKU maestro distinto/);
  });
  it("bounds combinations and refuses to omit unresolved categories", () => {
    assert.throws(
      () =>
        variantCombinations([
          {
            title: "A",
            values: Array.from({ length: 11 }, (_, i) => String(i)),
          },
          {
            title: "B",
            values: Array.from({ length: 10 }, (_, i) => String(i)),
          },
        ]),
      /100/,
    );
    const form = productForm();
    form.delete("categories_present");
    assert.throws(() => createCatalogBody(form), /categorías/);
  });
});
describe("image preflight", () => {
  it("checks content signatures and refuses SVG, empty and oversized files", async () => {
    const png = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      "a.png",
      { type: "image/png" },
    );
    assert.deepEqual(await validateCatalogImages([png]), [png]);
    for (const file of [
      new File(["<script>"], "fake.png", { type: "image/png" }),
      new File(["<svg/>"], "a.svg", { type: "image/svg+xml" }),
      new File([], "empty.png", { type: "image/png" }),
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", {
        type: "image/png",
      }),
    ])
      await assert.rejects(validateCatalogImages([file]));
    await assert.rejects(
      validateCatalogImages(Array.from({ length: 7 }, () => png)),
    );
  });
});
