import assert from "node:assert/strict"
import test from "node:test"

import {
  AUTH_HONEYPOT_FIELD,
  AUTH_RATE_LIMIT_MESSAGE,
  REGISTRATION_ERROR,
  authHoneypotResponse,
  authRateLimitResponse,
  passwordRecoveryResponse,
} from "./auth-form-protection.ts"
import {
  forgotCustomerPasswordAction,
  registerCustomerAction,
} from "../app/auth-actions.ts"

function filledHoneypot(value = "https://example.test") {
  const form = new FormData()
  form.append(AUTH_HONEYPOT_FIELD, value)
  return form
}

test("empty or omitted honeypots allow normal forms and preserve their fields", () => {
  for (const includeHoneypot of [false, true]) {
    const form = new FormData()
    form.set("email", "customer@example.test")
    form.set("password", "normal-password")
    if (includeHoneypot) form.set(AUTH_HONEYPOT_FIELD, "")
    const entries = [...form.entries()]
    for (const intent of ["register", "forgot-password"]) {
      assert.equal(authHoneypotResponse(form, intent), null)
      assert.deepEqual([...form.entries()], entries)
    }
  }
})

test("nonempty, repeated and binary honeypots stop registration", () => {
  const duplicate = new FormData()
  duplicate.append(AUTH_HONEYPOT_FIELD, "")
  duplicate.append(AUTH_HONEYPOT_FIELD, "filled")
  const binary = new FormData()
  binary.set(AUTH_HONEYPOT_FIELD, new Blob(["filled"]), "website.txt")

  for (const form of [filledHoneypot(), filledHoneypot(" "), duplicate, binary]) {
    assert.deepEqual(authHoneypotResponse(form, "register"), {
      status: "error",
      message: REGISTRATION_ERROR,
    })
  }
})

test("blocked recovery is indistinguishable from the normal recovery response", () => {
  for (const email of ["registered@example.test", "unknown@example.test", ""]) {
    const form = filledHoneypot()
    form.set("email", email)
    assert.deepEqual(
      authHoneypotResponse(form, "forgot-password"),
      passwordRecoveryResponse(),
    )
  }
})

test("registration action stops a trapped form before validation or service setup", async () => {
  assert.deepEqual(await registerCustomerAction({ status: "idle" }, filledHoneypot()), {
    status: "error",
    message: REGISTRATION_ERROR,
  })
})

test("recovery action stops a trapped form without a mail request or session context", async () => {
  assert.deepEqual(
    await forgotCustomerPasswordAction({ status: "idle" }, filledHoneypot()),
    passwordRecoveryResponse(),
  )
})

test("rate limiting receives retry feedback without reclassifying other errors", () => {
  assert.deepEqual(authRateLimitResponse(429), {
    status: "error",
    message: AUTH_RATE_LIMIT_MESSAGE,
  })
  for (const status of [undefined, 400, 401, 403, 409, 500, 503]) {
    assert.equal(authRateLimitResponse(status), null)
  }
})
