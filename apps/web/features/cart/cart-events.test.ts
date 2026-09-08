import assert from "node:assert/strict"
import test from "node:test"
import { createCartCountStore } from "./cart-events.ts"

test("a confirmed add remains visible when the header subscribes after it finishes", () => {
  const store = createCartCountStore()
  store.notify(1, 200)
  const unsubscribe = store.subscribe(() => {})
  assert.equal(store.getCount(0, 100), 1)
  unsubscribe()
})

test("a fresh server snapshot clears the count even when its value matches the original snapshot", () => {
  const store = createCartCountStore()
  assert.equal(store.getCount(0, 100), 0)
  store.notify(1, 200)
  assert.equal(store.getCount(0, 100), 1)
  assert.equal(store.getCount(0, 300), 0)
})

test("remounting the header after checkout uses the newer empty-cart snapshot", () => {
  const store = createCartCountStore()
  let oldHeaderCount = 0
  const unsubscribe = store.subscribe(() => {
    oldHeaderCount = store.getCount(0, 100) ?? 0
  })
  store.notify(3, 200)
  assert.equal(oldHeaderCount, 3)
  unsubscribe()
  assert.equal(store.getCount(0, 300), 0)
})

test("out-of-order or invalid confirmations cannot overwrite the latest confirmed count", () => {
  const store = createCartCountStore()
  let notifications = 0
  store.subscribe(() => { notifications++ })
  store.notify(4, 400)
  store.notify(2, 200)
  store.notify(-1, 500)
  store.notify(1.5, 500)
  store.notify(5, Number.NaN)
  assert.equal(store.getCount(0, 100), 4)
  assert.equal(notifications, 1)
})

test("a server read that starts in the confirmation millisecond keeps the confirmed result", () => {
  const store = createCartCountStore()
  store.notify(2, 200)
  assert.equal(store.getCount(0, 200), 2)
})

test("an unresolved cart stays unresolved until a confirmed mutation supplies its count", () => {
  const store = createCartCountStore()
  assert.equal(store.getCount(null, 100), null)
  store.notify(2, 200)
  assert.equal(store.getCount(null, 100), 2)
})
