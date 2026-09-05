import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ApplicationReminder } from "./components/application-reminder"

test("dismissal removes the entire pending header link, not only its warning style", (t) => {
  t.mock.method(React, "useSyncExternalStore", () => true)
  const html = renderToStaticMarkup(React.createElement(ApplicationReminder, {
    navigation: { label: "Continuar solicitud", unreadCount: 0, pendingKey: "app_1:draft:0" },
    href: "/account/sell",
  }))
  assert.equal(html, "")
})

test("an active reminder retains its navigation and dismiss button", (t) => {
  t.mock.method(React, "useSyncExternalStore", () => false)
  const html = renderToStaticMarkup(React.createElement(ApplicationReminder, {
    navigation: { label: "Continuar solicitud", unreadCount: 0, pendingKey: "app_1:draft:0" },
    href: "/account/sell",
  }))
  assert.match(html, /href="\/account\/sell"/)
  assert.match(html, /Ocultar aviso de solicitud pendiente/)
})

test("dismissal never hides an unrelated non-pending vendor link", (t) => {
  t.mock.method(React, "useSyncExternalStore", () => true)
  const html = renderToStaticMarkup(React.createElement(ApplicationReminder, {
    navigation: { label: "Mi tienda", unreadCount: 0 },
    href: "/account/sell",
  }))
  assert.match(html, /Mi tienda/)
  assert.doesNotMatch(html, /Ocultar aviso/)
})
