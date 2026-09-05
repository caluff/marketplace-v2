import assert from "node:assert/strict"
import test from "node:test"

import { getCustomerIdentity } from "./customer-identity"

test("avatar uses trimmed customer names and initials", () => {
  assert.deepEqual(
    getCustomerIdentity({
      first_name: "  Daniel ",
      last_name: " Caluff ",
      email: "test@example.invalid",
    }),
    { name: "Daniel Caluff", initials: "DC" },
  )
})

test("avatar supports customers with only one name", () => {
  assert.deepEqual(
    getCustomerIdentity({
      first_name: null,
      last_name: "Pérez",
      email: "test@example.invalid",
    }),
    { name: "Pérez", initials: "P" },
  )
})

test("avatar falls back to email initial when names are missing", () => {
  assert.deepEqual(
    getCustomerIdentity({
      first_name: " ",
      last_name: null,
      email: "cuenta@example.invalid",
    }),
    { name: "Mi cuenta", initials: "C" },
  )
  assert.equal(
    getCustomerIdentity({ first_name: null, last_name: null, email: "" })
      .initials,
    "U",
  )
})
