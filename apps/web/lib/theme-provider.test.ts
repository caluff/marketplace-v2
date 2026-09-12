import assert from "node:assert/strict"
import { test } from "node:test"
import { runInNewContext } from "node:vm"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ThemeProvider } from "../components/theme-provider"

function renderProvider() {
  return renderToStaticMarkup(
    ThemeProvider({
      attribute: "class",
      storageKey: "marketplace-v2-theme",
      children: createElement("main", null, "Storefront"),
    }),
  )
}

test("server bootstrap preserves the saved theme before hydration", () => {
  const html = renderProvider()
  const script = html.match(/<script([^>]*)>([\s\S]*?)<\/script>/)
  assert.ok(script)
  assert.doesNotMatch(script[1], /text\/plain/)
  for (const preference of ["light", "dark", "system"]) {
    const classes = new Set<string>()
    const style = { colorScheme: "" }
    runInNewContext(script[2], {
      document: {
        documentElement: {
          classList: {
            remove: (...values: string[]) => values.forEach((value) => classes.delete(value)),
            add: (value: string) => classes.add(value),
          },
          style,
        },
      },
      localStorage: { getItem: () => preference },
      window: { matchMedia: () => ({ matches: true }) },
    })
    const expected = preference === "system" ? "dark" : preference
    assert.deepEqual([...classes], [expected])
    assert.equal(style.colorScheme, expected)
  }
  assert.match(html, /<main>Storefront<\/main>/)
})

test("server and client renders keep the same executable bootstrap", () => {
  const serverHtml = renderProvider()
  const original = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} })
  try {
    const html = renderProvider()
    // next-themes intentionally clears the CSP nonce in browser renders.
    assert.equal(html.replace(' nonce=""', ""), serverHtml)
    assert.match(html, /<main>Storefront<\/main>/)
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original)
    else Reflect.deleteProperty(globalThis, "window")
  }
})
