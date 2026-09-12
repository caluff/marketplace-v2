import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HttpTypes } from "@mercurjs/types";
import { ProductReviewList } from "../src/features/product-review/components/product-list";
import { parseProductReviewFilters } from "../src/features/product-review/helpers";

test("catalog review renders backend images, linked sellers and pending edits on published products", () => {
  const result = {
    products: [
      {
        id: "prod_qa",
        title: "QA notebook",
        handle: "qa-notebook",
        status: "published",
        thumbnail: "https://images.example.test/notebook.png",
        sellers: [{ id: "sel_qa", name: "QA store" }],
        changes: [{ id: "change_qa", status: "pending" }],
      },
    ],
    count: 41,
    offset: 20,
    limit: 20,
  } as HttpTypes.AdminProductListResponse;
  const html = renderToStaticMarkup(
    createElement(ProductReviewList, {
      filters: parseProductReviewFilters({
        status: "published",
        q: "QA",
        offset: "20",
      }),
      result,
    }),
  );
  assert.match(html, /QA notebook/);
  assert.match(html, /QA store/);
  assert.match(html, /src="https:\/\/images.example.test\/notebook.png"/);
  assert.match(html, /Publicado/);
  assert.match(html, /Pendientes/);
  assert.match(html, /href="\/dashboard\/product-review\/prod_qa"/);
  assert.match(html, /offset=40/);
  assert.match(html, /offset=0/);
  assert.match(html, /21–21 de 41/);
});

test("empty catalog has no fabricated products or next-page link", () => {
  const html = renderToStaticMarkup(
    createElement(ProductReviewList, {
      filters: parseProductReviewFilters({}),
      result: { products: [], count: 0, offset: 0, limit: 20 },
    }),
  );
  assert.match(html, /No hay productos con estos filtros/);
  assert.doesNotMatch(html, /<img|Siguiente|Anterior|DEMO/);
});
