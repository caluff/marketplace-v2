import assert from "node:assert/strict"
import test from "node:test"

import { finishCustomerGoogleSignIn } from "./customer-google-sign-in.ts"
import {
  consumeOneTapTransaction,
  isOneTapCredential,
  oneTapCookieName,
} from "./google-one-tap.ts"

const token = (payload) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`
const fullToken = token({
  actor_type: "customer",
  actor_id: "customer-1",
  auth_identity_id: "identity-1",
})
const googleToken = token({ auth_identity_id: "google-identity" })

function sessionServices(overrides = {}) {
  const events = []
  const fail = async () => {
    throw new Error("Unexpected operation")
  }
  return {
    events,
    createCustomerSdk: () => ({
      store: {
        customer: {
          retrieve: async () => {
            events.push("profile")
            return { customer: { id: "customer-1" } }
          },
        },
      },
    }),
    setCustomerSession: async (...args) => {
      events.push(["session", ...args])
    },
    setMfaSecret: fail,
    setVerificationSecret: fail,
    ...overrides,
  }
}

test("a native customer token establishes the session after authorizing the profile", async () => {
  const services = sessionServices()
  assert.equal(
    await finishCustomerGoogleSignIn(fullToken, "/", undefined, services),
    "/",
  )
  assert.deepEqual(services.events, [
    "profile",
    ["session", fullToken, false, { preserveReceipt: false }],
  ])
})

test("OAuth checkout and seller destinations preserve the existing session options", async () => {
  for (const next of ["/checkout/confirmation", "/account/sell"]) {
    const services = sessionServices()
    assert.equal(
      await finishCustomerGoogleSignIn(fullToken, next, undefined, services),
      next,
    )
    assert.deepEqual(services.events[1], [
      "session",
      fullToken,
      next === "/account/sell",
      { preserveReceipt: next === "/checkout/confirmation" },
    ])
  }
})

test("an unbound Google identity completes and refreshes natively before establishing a customer session", async () => {
  const services = sessionServices()
  const createCustomerSdk = services.createCustomerSdk
  services.createCustomerSdk = (value) =>
    value === googleToken
      ? {
          client: {
            fetch: async (url, request) => {
              assert.equal(url, "/auth/google/complete")
              assert.deepEqual(request.body, { actor_type: "customer" })
              services.events.push("complete")
              return { status: "complete", token: "canonical-pending" }
            },
          },
        }
      : value === "canonical-pending"
        ? {
            auth: {
              refresh: async () => {
                services.events.push("refresh")
                return { token: fullToken }
              },
            },
          }
        : createCustomerSdk(value)
  assert.equal(
    await finishCustomerGoogleSignIn(googleToken, "/", undefined, services),
    "/",
  )
  assert.deepEqual(services.events.slice(0, 3), [
    "complete",
    "refresh",
    "profile",
  ])
  assert.equal(services.events[3][1], fullToken)
})

test("Google linking still requires the existing proof when automatic linking is unavailable", async () => {
  const services = sessionServices({
    createCustomerSdk: () => ({
      client: { fetch: async () => ({ status: "link_required" }) },
    }),
  })
  const next = "/account/orders/claim"
  assert.equal(
    await finishCustomerGoogleSignIn(googleToken, next, undefined, services),
    `/login?google=link_required&next=${encodeURIComponent(`/auth/google/link?next=${encodeURIComponent(next)}`)}`,
  )
  assert.deepEqual(services.events, [])
})

test("native MFA produces only a pending challenge and never a customer session", async () => {
  let challenge
  const services = sessionServices({
    setMfaSecret: async (value) => {
      challenge = value
    },
  })
  const response = {
    mfa_required: true,
    token: "partial-token",
    mfa_challenge: { id: "challenge-1", methods: ["totp"] },
  }
  assert.equal(
    await finishCustomerGoogleSignIn(response, "/", undefined, services),
    "/login?google=mfa_required&next=%2F",
  )
  assert.deepEqual(challenge, {
    token: "partial-token",
    challengeId: "challenge-1",
    methods: ["totp"],
  })
  assert.deepEqual(services.events, [])
})

test("canonical refresh cannot bypass the account's native MFA", async () => {
  let challenge
  const services = sessionServices({
    createCustomerSdk: (value) =>
      value === googleToken
        ? {
            client: {
              fetch: async () => ({ status: "complete", token: "pending" }),
            },
          }
        : {
            auth: {
              refresh: async () => ({
                mfa_required: true,
                token: "partial",
                mfa_challenge: { id: "challenge-1", methods: ["totp"] },
              }),
            },
          },
    setMfaSecret: async (value) => {
      challenge = value
    },
  })
  assert.equal(
    await finishCustomerGoogleSignIn(googleToken, "/", undefined, services),
    "/login?google=mfa_required&next=%2F",
  )
  assert.equal(challenge.token, "partial")
  assert.deepEqual(services.events, [])
})

test("native verification remains pending and requires a verified email from the API", async () => {
  let verification
  const services = sessionServices({
    setVerificationSecret: async (value) => {
      verification = value
    },
  })
  const response = {
    verification_required: true,
    token: "pending",
    verification: { entity_id: "buyer@example.test" },
  }
  assert.equal(
    await finishCustomerGoogleSignIn(response, "/", undefined, services),
    "/verify-email?next=%2F",
  )
  assert.deepEqual(verification, {
    token: "pending",
    email: "buyer@example.test",
  })
  await assert.rejects(
    finishCustomerGoogleSignIn(
      { verification_required: true, token: "pending" },
      "/",
      undefined,
      services,
    ),
  )
  assert.deepEqual(services.events, [])
})

test("an explicit linking flow rejects a changed identity without saving partial credentials", async () => {
  const services = sessionServices()
  const response = {
    mfa_required: true,
    token: googleToken,
    mfa_challenge: { id: "challenge", methods: ["totp"] },
  }
  await assert.rejects(
    finishCustomerGoogleSignIn(response, "/", fullToken, services),
    /Account conflict/,
  )
  assert.deepEqual(services.events, [])
})

test("a rejected profile never establishes a session", async () => {
  const services = sessionServices({
    createCustomerSdk: () => ({
      store: {
        customer: {
          retrieve: async () => {
            throw new Error("Unauthorized profile")
          },
        },
      },
    }),
  })
  await assert.rejects(
    finishCustomerGoogleSignIn(fullToken, "/", undefined, services),
    /Unauthorized profile/,
  )
  assert.deepEqual(services.events, [])
})

test("invalid One Tap input is bounded before being sent to the provider", () => {
  for (const value of [
    null,
    undefined,
    {},
    ["a.b.c"],
    "",
    "a.b",
    "a.b.c.d",
    "a.b.c with spaces",
    `a.b.${"c".repeat(8189)}`,
  ])
    assert.equal(isOneTapCredential(value), false)
  assert.equal(isOneTapCredential("eyJ.test-payload.signature_value"), true)
  assert.equal(isOneTapCredential(`a.b.${"c".repeat(8188)}`), true)
})

test("two home tabs consume only their own One Tap proof", () => {
  const nonceA = "a".repeat(43)
  const nonceB = "b".repeat(43)
  const cookies = new Map([
    [oneTapCookieName(nonceA), "proof-A"],
    [oneTapCookieName(nonceB), "proof-B"],
  ])
  const store = {
    get: (name) => {
      const value = cookies.get(name)
      return value ? { value } : undefined
    },
    delete: (name) => cookies.delete(name),
  }
  assert.equal(consumeOneTapTransaction(store, nonceA), "proof-A")
  assert.equal(consumeOneTapTransaction(store, nonceA), undefined)
  assert.equal(consumeOneTapTransaction(store, nonceB), "proof-B")
  assert.equal(cookies.size, 0)
})

test("invalid nonces cannot read or delete cookies", () => {
  const unexpected = () => {
    throw new Error("Unexpected cookie operation")
  }
  for (const nonce of [
    undefined,
    null,
    {},
    "",
    "a".repeat(42),
    "a".repeat(44),
    "../session",
    "!".repeat(43),
  ]) {
    assert.equal(oneTapCookieName(nonce), null)
    assert.equal(
      consumeOneTapTransaction({ get: unexpected, delete: unexpected }, nonce),
      undefined,
    )
  }
})
