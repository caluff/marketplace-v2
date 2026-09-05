import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"

import {
  accountFormValues,
  normalizeUsPhone,
  validateAddress,
  validateProfile,
} from "./validation"

const address = {
  first_name: "Daniel",
  last_name: "Prueba",
  phone: "+12025550123",
  address_name: "Casa",
  address_1: "123 Main Street",
  city: "Washington",
  province: "dc",
  country_code: "us",
  postal_code: "20001",
}

test("account validation loads in the React Server Components runtime", () => {
  execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import=tsx",
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(new URL("./validation.ts", import.meta.url).href)})`,
    ],
    { stdio: "pipe" },
  )
})

test("normalizes US national and international phones to E.164", () => {
  assert.equal(normalizeUsPhone("(202) 555-0123"), "+12025550123")
  assert.equal(normalizeUsPhone("+1 202 555 0123"), "+12025550123")
})

test("rejects invalid, foreign and non-US +1 phones and extensions", () => {
  for (const value of [
    "",
    "123",
    "+14165550123",
    "+17875550123",
    "+442079460958",
    "+12025550123 ext 9",
  ]) {
    assert.equal(normalizeUsPhone(value), null, value)
  }
})

test("allows an empty profile phone but requires a valid address phone", () => {
  assert.deepEqual(validateProfile({ ...address, phone: "" }), {})
  assert.ok(validateAddress({ ...address, phone: "" }).phone)
  assert.ok(validateProfile({ ...address, phone: "+14165550123" }).phone)
})

test("validates US addresses including state and ZIP+4", () => {
  assert.deepEqual(validateAddress(address), {})
  assert.deepEqual(
    validateAddress({ ...address, postal_code: "20001-1234" }),
    {},
  )
  assert.ok(validateAddress({ ...address, country_code: "ca" }).country_code)
  assert.ok(validateAddress({ ...address, province: "on" }).province)
  assert.ok(validateAddress({ ...address, postal_code: "2000" }).postal_code)
  assert.ok(validateAddress({ ...address, address_1: "" }).address_1)
})

test("trims submitted values and excludes React action fields and files", () => {
  const data = new FormData()
  data.set("first_name", "  Daniel  ")
  data.set("$ACTION_ID_test", "internal")
  data.set("attachment", new Blob(["ignored"]), "test.txt")
  assert.deepEqual(accountFormValues(data), { first_name: "Daniel" })
})
