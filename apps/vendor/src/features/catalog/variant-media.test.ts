import assert from "node:assert/strict";
import { test } from "node:test";
import { variantMediaChanges, variantUploadedImages } from "./operations";

test("variant image edits retain existing links and send only additions and removals", () => {
  const form = new FormData();
  form.set("variant_images", JSON.stringify(["img_retained", "img_new"]));
  assert.deepEqual(
    variantMediaChanges(form, [{ id: "img_retained" }, { id: "img_removed" }]),
    { add: ["img_new"], remove: ["img_removed"] },
  );
  form.set("variant_images", "[]");
  assert.deepEqual(variantMediaChanges(form, [{ id: "img_retained" }]), {
    add: [],
    remove: ["img_retained"],
  });
});

test("uploaded variant media accepts URLs and rejects duplicate or malformed files", () => {
  const form = new FormData();
  assert.deepEqual(variantUploadedImages(form), []);
  form.set(
    "variant_uploaded_images",
    JSON.stringify([{ url: "https://example.test/printed.jpg" }]),
  );
  assert.deepEqual(variantUploadedImages(form), [
    { url: "https://example.test/printed.jpg" },
  ]);
  for (const value of [
    [{ url: "javascript:alert(1)" }],
    ["https://example.test/printed.jpg"],
    [
      { url: "https://example.test/a.jpg" },
      { url: "https://example.test/a.jpg" },
    ],
  ]) {
    form.set("variant_uploaded_images", JSON.stringify(value));
    assert.throws(() => variantUploadedImages(form));
  }
});

test("variant image edits reject malformed and repeated resource ids", () => {
  const form = new FormData();
  for (const value of [
    ["img_same", "img_same"],
    [123],
    ["../../invalid"],
    {},
  ]) {
    form.set("variant_images", JSON.stringify(value));
    assert.throws(() => variantMediaChanges(form, []));
  }
});
