import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement, lazy, Suspense } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CatalogMenu } from "../components/catalog-menu"

test("catalog trigger renders while server categories are unresolved", () => {
  const PendingCategories = lazy(() => new Promise<never>(() => {}))
  const html = renderToStaticMarkup(
    CatalogMenu({
      children: createElement(
        Suspense,
        { fallback: "Cargando categorías" },
        createElement(PendingCategories),
      ),
    }),
  )
  assert.equal((html.match(/<button\b/g) ?? []).length, 1)
  assert.match(html, /aria-label="Abrir catálogo y categorías"/)
  assert.match(html, /aria-haspopup="menu"/)
  assert.match(html, /aria-expanded="false"/)
  assert.doesNotMatch(html, /Cargando categorías/)
})
