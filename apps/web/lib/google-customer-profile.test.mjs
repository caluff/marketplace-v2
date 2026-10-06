import assert from "node:assert/strict"
import test from "node:test"
import { readGoogleCustomerProfile } from "./google-customer-profile.ts"
import { getCustomerIdentity } from "../features/account/customer-identity.ts"

const picture = "https://lh3.googleusercontent.com/a/profile"
const token = (changes = {}) =>
  `header.${Buffer.from(
    JSON.stringify({
      actor_type: "customer",
      actor_id: "cus_test",
      auth_provider: "google",
      user_metadata: { name: "Google Name", picture },
      ...changes,
    }),
  ).toString("base64url")}.signature`

test("uses only Google presentation fields for the authenticated customer", () => {
  assert.deepEqual(readGoogleCustomerProfile(token(), "cus_test"), {
    name: "Google Name",
    picture,
  })
  for (const changes of [
    { actor_type: "user" },
    { actor_id: "cus_other" },
    { auth_provider: "emailpass" },
    { user_metadata: null },
  ])
    assert.equal(readGoogleCustomerProfile(token(changes), "cus_test"), null)
  for (const value of [undefined, "", "invalid", "header.e30.signature"])
    assert.equal(readGoogleCustomerProfile(value, "cus_test"), null)
})

test("missing full name uses given and family names", () => {
  assert.deepEqual(
    readGoogleCustomerProfile(
      token({
        user_metadata: {
          given_name: "  Google ",
          family_name: " Name ",
          picture,
        },
      }),
      "cus_test",
    ),
    { name: "Google Name", picture },
  )
})

test("invalid or untrusted pictures never discard the Google name", () => {
  for (const value of [
    "invalid",
    "http://lh3.googleusercontent.com/a",
    "https://googleusercontent.com.attacker.test/a",
    "https://attackergoogleusercontent.com/a",
    "https://user:secret@lh3.googleusercontent.com/a",
    "https://lh3.googleusercontent.com:8443/a",
    "data:image/png;base64,test",
  ])
    assert.deepEqual(
      readGoogleCustomerProfile(
        token({
          user_metadata: { name: "Google Name", picture: value },
        }),
        "cus_test",
      ),
      { name: "Google Name", picture: null },
    )
})

test("saved customer names take precedence and work without Google", () => {
  const customer = {
    first_name: "Saved",
    last_name: "Name",
    email: "test@example.com",
  }
  assert.equal(getCustomerIdentity(customer).name, "Saved Name")
  assert.equal(getCustomerIdentity(customer, "Google Name").name, "Saved Name")
  assert.equal(
    getCustomerIdentity(
      { ...customer, first_name: null, last_name: null },
      "Google Name",
    ).name,
    "Google Name",
  )
})
