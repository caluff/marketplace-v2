import assert from "node:assert/strict"
import test from "node:test"

import { parseOrderTrackingFragment } from "./fragment.ts"

const token = "v1.payload.signature"

test("the private token is read from the fragment without URL query parameters", () => {
  assert.equal(parseOrderTrackingFragment(`#token=${token}`), token)
  assert.equal(parseOrderTrackingFragment(`?token=${token}`), null)
  assert.equal(parseOrderTrackingFragment(`token=${token}`), null)
})

test("duplicate token fields and unexpected parameters are rejected", () => {
  assert.equal(parseOrderTrackingFragment(`#token=${token}&token=another`), null)
  assert.equal(parseOrderTrackingFragment(`#token=${token}&extra=value`), null)
  assert.equal(parseOrderTrackingFragment(`#extra=value&token=${token}`), null)
})

test("missing, encoded, malformed and oversized fragments are rejected", () => {
  for (const fragment of [
    undefined,
    null,
    "",
    "#",
    "#token=",
    "#token=%",
    "#token=%76%31.payload.signature",
    "#token=with space",
    "#token=with/slash",
    "#token=abc\n",
    `#token=${"x".repeat(2049)}`,
  ]) {
    assert.equal(parseOrderTrackingFragment(fragment), null)
  }
})

test("valid URL-safe tokens at the supported length are preserved exactly", () => {
  const longest = "x".repeat(2048)
  assert.equal(parseOrderTrackingFragment(`#token=${longest}`), longest)
})
