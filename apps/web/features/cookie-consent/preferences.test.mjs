import assert from "node:assert/strict"
import test from "node:test"
import {
  COOKIE_CONSENT_MAX_AGE,
  createCookiePreferences,
  readCookiePreferences,
} from "./preferences.ts"

const now = 1_800_000_000_000

test("no choice, malformed data and unknown consent versions never enable optional services", () => {
  for (const raw of [
    null,
    undefined,
    "",
    "not-json",
    "null",
    "[]",
    "true",
    JSON.stringify({ version: 2, googleOneTap: true, expiresAt: now + 1000 }),
    JSON.stringify({ version: 1, googleOneTap: "true", expiresAt: now + 1000 }),
    JSON.stringify({ version: 1, googleOneTap: true }),
    JSON.stringify({ version: 1, googleOneTap: true, expiresAt: "tomorrow" }),
  ]) {
    assert.equal(readCookiePreferences(raw, now), null)
  }
})

test("acceptance and rejection survive persistence for 180 days", () => {
  for (const googleOneTap of [false, true]) {
    const preferences = createCookiePreferences(googleOneTap, now)
    const raw = JSON.stringify(preferences)
    assert.equal(preferences.expiresAt - now, COOKIE_CONSENT_MAX_AGE)
    assert.deepEqual(readCookiePreferences(raw, now), preferences)
    assert.deepEqual(
      readCookiePreferences(raw, now + COOKIE_CONSENT_MAX_AGE - 1),
      preferences,
    )
    assert.equal(readCookiePreferences(raw, now + COOKIE_CONSENT_MAX_AGE), null)
  }
})

test("expired and impossible expiry values require a new choice", () => {
  for (const expiresAt of [
    now - 1,
    now,
    now + COOKIE_CONSENT_MAX_AGE + 1,
    Infinity,
  ]) {
    assert.equal(
      readCookiePreferences(
        JSON.stringify({ version: 1, googleOneTap: true, expiresAt }),
        now,
      ),
      null,
    )
  }
})

test("withdrawing acceptance replaces the optional permission immediately", () => {
  const accepted = createCookiePreferences(true, now)
  const rejected = createCookiePreferences(false, now + 100)
  assert.equal(
    readCookiePreferences(JSON.stringify(accepted), now + 100)?.googleOneTap,
    true,
  )
  assert.equal(
    readCookiePreferences(JSON.stringify(rejected), now + 100)?.googleOneTap,
    false,
  )
})
