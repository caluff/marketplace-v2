import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductChangeDetails } from "../src/features/product-review/components/image-change-preview";

const render = (details: unknown) =>
  renderToStaticMarkup(createElement(ProductChangeDetails, { details }));

test("image changes show previous and proposed images instead of serialized details", () => {
  const html = render({
    field: "images",
    previous_value: [{ url: "https://cdn.example.test/old.png" }],
    value: [{ url: "https://cdn.example.test/new.png" }],
  });
  assert.match(html, /Imágenes actuales/);
  assert.match(html, /Imágenes propuestas/);
  assert.match(html, /src="https:\/\/cdn.example.test\/old.png"/);
  assert.match(html, /src="https:\/\/cdn.example.test\/new.png"/);
  assert.doesNotMatch(html, /<pre/);
});

test("removing all images is explicit and unsafe URLs are never loaded or linked", () => {
  const html = render({
    field: "images",
    previous_value: [
      { url: "javascript:alert(1)" },
      { url: "https://user:secret@cdn.example.test/a.png" },
      { url: "data:image/svg+xml,test" },
    ],
    value: [],
  });
  assert.match(html, /Sin imágenes/);
  assert.equal((html.match(/Vista previa no disponible/g) ?? []).length, 3);
  assert.doesNotMatch(html, /<img|href=|secret|javascript:/);
});

test("other operations and malformed image changes remain inspectable", () => {
  for (const details of [
    { field: "title", value: "Nuevo nombre" },
    { field: "images", value: "invalid" },
  ]) {
    assert.match(render(details), /<pre/);
  }
});
