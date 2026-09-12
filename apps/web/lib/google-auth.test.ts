import assert from "node:assert/strict"
import test from "node:test"
import {
  googleAuthorizationUrl,
  googleCallbackUrl,
  googleNextPath,
  readGoogleTransaction,
  sameGoogleAuthIdentity,
  tokenHasCustomer,
} from "./google-auth"

const state = "a".repeat(64)
const callback = "http://localhost:3000/auth/google/callback"
const pack = (data: unknown) =>
  Buffer.from(JSON.stringify(data)).toString("base64url")

test("Google transaction binds browser state and expires independently of cookie lifetime", () => {
  const data = { state, next: "/account/orders", createdAt: 1_000 }
  assert.equal(
    readGoogleTransaction(pack(data), state, 2_000)?.next,
    "/account/orders",
  )
  assert.equal(readGoogleTransaction(pack(data), "b".repeat(64), 2_000), null)
  assert.equal(readGoogleTransaction(pack(data), state, 602_000), null)
  assert.equal(readGoogleTransaction(pack(data), state, 500), null)
  assert.equal(readGoogleTransaction("invalid", state, 2_000), null)
  assert.equal(
    readGoogleTransaction(
      pack({ ...data, sessionHash: "invalid" }),
      state,
      2_000,
    ),
    null,
  )
})

test("Google redirects are restricted to Google's authorization endpoint and our exact callback", () => {
  const location = `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&redirect_uri=${encodeURIComponent(callback)}`
  assert.equal(googleAuthorizationUrl(location, callback)?.state, state)
  for (const bad of [
    location.replace(
      "accounts.google.com",
      "accounts.google.com.attacker.test",
    ),
    location.replace("https:", "http:"),
    location.replace("/o/oauth2/v2/auth", "/other"),
    location.replace(state, "short"),
  ]) {
    assert.equal(googleAuthorizationUrl(bad, callback), null)
  }
  assert.equal(
    googleAuthorizationUrl(location, "https://other.test/auth/google/callback"),
    null,
  )
})

test("callback configuration and final redirects reject unsafe destinations and OAuth loops", () => {
  assert.equal(googleCallbackUrl(callback), callback)
  assert.equal(
    googleCallbackUrl("https://store.example/auth/google/callback"),
    "https://store.example/auth/google/callback",
  )
  for (const bad of [
    undefined,
    "http://store.example/auth/google/callback",
    `${callback}?next=x`,
    `${callback}#x`,
    "https://user:pass@store.example/auth/google/callback",
  ])
    assert.equal(googleCallbackUrl(bad), null)
  for (const bad of [
    "//evil.test",
    "https://evil.test",
    "/\\evil.test",
    "/auth/google/callback",
    "/auth/google/link",
    "/auth/vendor?next=https://evil.test",
    "/auth/vendor/callback",
  ])
    assert.equal(googleNextPath(bad), "/account")
  assert.equal(googleNextPath("/auth/vendor"), "/auth/vendor")
  assert.equal(
    googleNextPath("/account/orders?filter=recent"),
    "/account/orders?filter=recent",
  )
})

test("actor detection never treats an unregistered or different actor token as a customer session", () => {
  const token = (payload: unknown) => `header.${pack(payload)}.signature`
  assert.equal(
    tokenHasCustomer(token({ actor_type: "customer", actor_id: "cus_one" })),
    true,
  )
  assert.equal(
    tokenHasCustomer(token({ actor_type: "customer", actor_id: "" })),
    false,
  )
  assert.equal(
    tokenHasCustomer(token({ actor_type: "user", actor_id: "usr_one" })),
    false,
  )
  assert.equal(tokenHasCustomer("invalid"), false)
})

test("linking cannot continue another account's MFA or verification challenge", () => {
  const token = (id: string) =>
    `header.${pack({ auth_identity_id: id })}.signature`
  assert.equal(
    sameGoogleAuthIdentity(token("auth_original"), token("auth_original")),
    true,
  )
  assert.equal(
    sameGoogleAuthIdentity(token("auth_other"), token("auth_original")),
    false,
  )
  assert.equal(sameGoogleAuthIdentity("invalid", token("auth_original")), false)
  assert.equal(sameGoogleAuthIdentity(token(""), token("")), false)
})
