import assert from "node:assert/strict"
import test from "node:test"
import { getProductSpecifications } from "./product-specifications.ts"

const product = {
  material: "PLA",
  weight: 100,
  length: 120,
  width: 80,
  height: 60,
  options: [
    { id: "size", title: "Tamaño" },
    { id: "hidden", title: "Default option" },
  ],
}
const small = {
  id: "small",
  material: null,
  weight: 55,
  length: 90,
  width: null,
  options: [
    { option_id: "size", value: "Pequeño" },
    { option_id: "hidden", value: "__default__" },
  ],
}
const large = {
  id: "large",
  material: "PETG",
  weight: 250,
  length: 200,
  options: [{ option_id: "size", value: "Grande" }],
}

test("each selected variant overrides its own fields and inherits missing defaults", () => {
  const smallRows = Object.fromEntries(
    getProductSpecifications(product, [small, large], small),
  )
  assert.equal(smallRows.Material, "PLA")
  assert.equal(smallRows.Peso, "55 g")
  assert.equal(smallRows.Largo, "90 mm")
  assert.equal(smallRows.Ancho, "80 mm")
  assert.equal(smallRows.Alto, "60 mm")
  assert.equal(smallRows.Tamaño, "Pequeño")
  const largeRows = Object.fromEntries(
    getProductSpecifications(product, [small, large], large),
  )
  assert.equal(largeRows.Material, "PETG")
  assert.equal(largeRows.Peso, "250 g")
  assert.equal(largeRows.Tamaño, "Grande")
  assert.ok(!("Default option" in largeRows))
})

test("unselected products show their general specifications and available options", () => {
  const rows = Object.fromEntries(
    getProductSpecifications(product, [small, large]),
  )
  assert.equal(rows.Peso, "100 g")
  assert.equal(rows.Tamaño, "Pequeño, Grande")
})

test("a material option does not duplicate the resolved technical material", () => {
  const withMaterial = {
    ...product,
    options: [...product.options, { id: "material", title: "Material" }],
  }
  const variant = {
    ...large,
    options: [...large.options, { option_id: "material", value: "PETG" }],
  }
  const rows = getProductSpecifications(withMaterial, [variant], variant)
  assert.deepEqual(
    rows.filter(([label]) => label === "Material"),
    [["Material", "PETG"]],
  )
})

test("clearing an override follows future changes to the general specification", () => {
  const variant = { ...small, weight: null }
  const updated = { ...product, material: "PLA reciclado", weight: 125 }
  const rows = Object.fromEntries(
    getProductSpecifications(updated, [variant], variant),
  )
  assert.equal(rows.Peso, "125 g")
  assert.equal(rows.Material, "PLA reciclado")
})

test("empty products and invalid legacy measurements do not fabricate specifications", () => {
  assert.deepEqual(
    getProductSpecifications(
      { material: null, weight: 0, length: -1, width: NaN, height: Infinity },
      [],
    ),
    [],
  )
})
