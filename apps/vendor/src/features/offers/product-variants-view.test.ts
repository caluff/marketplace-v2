import assert from "node:assert/strict";
import { test } from "node:test";
import { organizeVariants } from "./product-variants-view";

const rows = [
  {
    id: "large",
    title: "Grande",
    values: ["PLA"],
    priceAmount: 26,
    stockQuantity: 8,
  },
  {
    id: "small",
    title: "Compacta",
    values: ["PETG"],
    priceAmount: 12,
    stockQuantity: 18,
  },
  {
    id: "empty",
    title: "Estándar",
    values: ["PLA"],
    priceAmount: 0,
    stockQuantity: 0,
  },
  { id: "draft", title: "Sin configurar", values: [] },
];

test("search and stock filters work together without treating unknown quantities as sold out", () => {
  assert.deepEqual(
    organizeVariants(rows, " pla ", "in-stock", "original").map(
      (row) => row.id,
    ),
    ["large"],
  );
  assert.deepEqual(
    organizeVariants(rows, "", "out-of-stock", "original").map((row) => row.id),
    ["empty"],
  );
  assert.deepEqual(
    organizeVariants(rows, "", "unconfigured", "original").map((row) => row.id),
    ["draft"],
  );
  assert.deepEqual(organizeVariants(rows, "no existe", "all", "original"), []);
});

test("name and numeric sorting preserve zero values and leave unknown data last", () => {
  assert.deepEqual(
    organizeVariants(rows, "", "all", "name-asc").map((row) => row.id),
    ["small", "empty", "large", "draft"],
  );
  assert.deepEqual(
    organizeVariants(rows, "", "all", "name-desc").map((row) => row.id),
    ["draft", "large", "empty", "small"],
  );
  assert.deepEqual(
    organizeVariants(rows, "", "all", "price-asc").map((row) => row.id),
    ["empty", "small", "large", "draft"],
  );
  assert.deepEqual(
    organizeVariants(rows, "", "all", "price-desc").map((row) => row.id),
    ["large", "small", "empty", "draft"],
  );
  assert.deepEqual(
    organizeVariants(rows, "", "all", "stock-desc").map((row) => row.id),
    ["small", "large", "empty", "draft"],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["large", "small", "empty", "draft"],
  );
});
