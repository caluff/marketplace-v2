import assert from "node:assert/strict"
import test from "node:test"
import {
  getCookiePreferencesServerSnapshot,
  getCookiePreferencesSnapshot,
  saveCookiePreferences,
  subscribeToCookiePreferences,
} from "./browser-store.ts"
import {
  COOKIE_CONSENT_STORAGE_KEY,
  createCookiePreferences,
} from "./preferences.ts"

test("browser choices persist, synchronize across tabs, and still apply if storage is blocked", () => {
  const originalWindow = globalThis.window
  const events = new EventTarget()
  const values = new Map()
  let isBlocked = false
  globalThis.window = Object.assign(events, {
    localStorage: {
      getItem: (key) => {
        if (isBlocked) throw new Error("Storage blocked")
        return values.get(key) ?? null
      },
      setItem: (key, value) => {
        if (isBlocked) throw new Error("Storage blocked")
        values.set(key, value)
      },
    },
  })
  let changes = 0
  const unsubscribe = subscribeToCookiePreferences(() => changes++)
  try {
    assert.equal(getCookiePreferencesServerSnapshot(), undefined)
    assert.equal(getCookiePreferencesSnapshot(), null)
    const accepted = createCookiePreferences(true)
    assert.equal(saveCookiePreferences(accepted), true)
    assert.deepEqual(
      JSON.parse(values.get(COOKIE_CONSENT_STORAGE_KEY)),
      accepted,
    )
    assert.equal(changes, 1)

    const rejected = createCookiePreferences(false)
    values.set(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(rejected))
    events.dispatchEvent(
      Object.assign(new Event("storage"), { key: COOKIE_CONSENT_STORAGE_KEY }),
    )
    assert.deepEqual(JSON.parse(getCookiePreferencesSnapshot()), rejected)
    assert.equal(changes, 2)

    events.dispatchEvent(
      Object.assign(new Event("storage"), { key: "unrelated" }),
    )
    assert.equal(changes, 2)

    values.clear()
    events.dispatchEvent(Object.assign(new Event("storage"), { key: null }))
    assert.equal(getCookiePreferencesSnapshot(), null)

    isBlocked = true
    assert.equal(saveCookiePreferences(rejected), false)
    assert.deepEqual(JSON.parse(getCookiePreferencesSnapshot()), rejected)
    const beforeUnsubscribe = changes
    unsubscribe()
    saveCookiePreferences(accepted)
    assert.equal(changes, beforeUnsubscribe)
  } finally {
    unsubscribe()
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})
