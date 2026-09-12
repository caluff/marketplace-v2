import assert from "node:assert/strict"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { HttpTypes } from "@medusajs/types"
import { ProductDetails } from "./product-details"

function render(product: Partial<HttpTypes.StoreProduct>) {
  return renderToStaticMarkup(
    createElement(ProductDetails, {
      product: product as HttpTypes.StoreProduct,
    }),
  )
}

test("product details omit internal default variant options and show an honest empty state", () => {
  const product = {
    options: [{ id: "opt_default", title: "__default__" }],
    variants: [
      { options: [{ option_id: "opt_default", value: "__default__" }] },
    ],
  } as HttpTypes.StoreProduct
  const html = render(product)
  assert.doesNotMatch(html, /__default__/)
  assert.match(html, /no agregó especificaciones/)
  assert.match(html, /no agregó una descripción/)
})

test("product specifications preserve catalog grams and millimeters without conversions", () => {
  const html = render({
    material: "Aluminio",
    weight: 250.5,
    length: 120,
    width: 60,
    height: 0,
  })
  assert.match(html, /Aluminio/)
  assert.match(html, /250.5 g/)
  assert.match(html, /120 mm/)
  assert.match(html, /60 mm/)
  assert.doesNotMatch(html, />Alto</)
})

test("product descriptions render as text, preserving paragraphs without executing markup", () => {
  const html = render({
    description: "Primera línea.\nSegunda línea. <script>alert(1)</script>",
  })
  assert.match(html, /Primera línea\.\nSegunda línea\./)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
})
