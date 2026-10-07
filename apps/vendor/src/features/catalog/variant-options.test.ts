import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasVariantCombination,
  newVariantOptionDraft,
} from "./variant-options";

const options = [
  {
    id: "size",
    title: "Tamaño",
    values: [{ value: "Mini" }, { value: "Grande" }],
  },
  {
    id: "material",
    title: "Material",
    values: [{ value: "PLA" }, { value: "PETG" }],
  },
];
function variant(id: string, size: string, material: string) {
  return {
    id,
    options: [
      { option_id: "size", value: size },
      { option_id: "material", value: material },
    ],
  };
}

test("a new variant starts with an unused combination, preserving option order", () => {
  assert.deepEqual(
    newVariantOptionDraft({
      options,
      variants: [variant("one", "Mini", "PLA")],
    }),
    [
      { isNew: false, value: "Mini" },
      { isNew: false, value: "PETG" },
    ],
  );
});

test("a full combination grid still permits a new value without another preliminary save", () => {
  const product = {
    options,
    variants: [
      variant("one", "Mini", "PLA"),
      variant("two", "Mini", "PETG"),
      variant("three", "Grande", "PLA"),
      variant("four", "Grande", "PETG"),
    ],
  };
  assert.deepEqual(newVariantOptionDraft(product), [
    { isNew: true, value: "" },
    { isNew: false, value: "PLA" },
  ]);
  assert.equal(hasVariantCombination(product, ["Extragrande", "PLA"]), false);
  assert.equal(hasVariantCombination(product, ["Mini", "PETG"]), true);
});

test("an axis without values requires a new value and preserves defaults on other axes", () => {
  assert.deepEqual(
    newVariantOptionDraft({
      options: [{ ...options[0], values: [] }, options[1]],
    }),
    [
      { isNew: true, value: "" },
      { isNew: false, value: "PLA" },
    ],
  );
});
