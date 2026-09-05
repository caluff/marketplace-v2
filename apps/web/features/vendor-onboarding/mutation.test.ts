import assert from "node:assert/strict"
import test from "node:test"
import { FetchError } from "@medusajs/js-sdk"
import type { ApplicationResponse } from "@marketplace-v2/vendor-onboarding-contracts"
import { performApplicationMutation } from "./mutation"

const response: ApplicationResponse = {
  application: null,
  applicant: {
    email: "person@example.com",
    email_verified: false,
    existing_vendor_access: false,
  },
  unread_count: 0,
}

test("successful save returns the authoritative response without a redundant recovery read", async () => {
  const calls: string[] = []
  const result = await performApplicationMutation({
    authenticate: async () => {
      calls.push("authenticate")
      return { actor: "customer" }
    },
    mutate: async (context) => {
      assert.equal(context.actor, "customer")
      calls.push("save")
      return response
    },
    reload: async () => {
      calls.push("reload")
      return response
    },
  })
  assert.deepEqual(calls, ["authenticate", "save"])
  assert.equal(result.status, "success")
  assert.equal(result.response, response)
})

test("authentication failure escapes before any mutation or recovery read", async () => {
  let touched = false
  const redirect = new Error("session redirect")
  await assert.rejects(
    performApplicationMutation({
      authenticate: async () => {
        throw redirect
      },
      mutate: async () => {
        touched = true
        return response
      },
      reload: async () => {
        touched = true
        return response
      },
    }),
    (error) => error === redirect,
  )
  assert.equal(touched, false)
})

test("409 reloads current application for explicit recovery without replaying a write", async () => {
  let writes = 0
  let reads = 0
  const result = await performApplicationMutation({
    authenticate: async () => {},
    mutate: async () => {
      writes++
      throw new FetchError("conflict", "Conflict", 409)
    },
    reload: async () => {
      reads++
      return response
    },
  })
  assert.equal(result.status, "conflict")
  assert.equal(result.response, response)
  assert.equal(writes, 1)
  assert.equal(reads, 1)
})

test("failed conflict recovery remains a conflict with no fabricated application", async () => {
  const result = await performApplicationMutation({
    authenticate: async () => {},
    mutate: async () => {
      throw new FetchError("conflict", "Conflict", 409)
    },
    reload: async () => {
      throw new Error("offline")
    },
  })
  assert.equal(result.status, "conflict")
  assert.equal(result.response, undefined)
})

test("uncertain network error permits same-operation retry without exposing backend text", async () => {
  const result = await performApplicationMutation({
    authenticate: async () => {},
    mutate: async () => {
      throw new Error("private stack and token")
    },
    reload: async () => response,
  })
  assert.equal(result.status, "error")
  assert.equal(result.retryable, true)
  assert.ok(!result.message.includes("private"))
})

test("unverified submission is reported as an error and never as success", async () => {
  const result = await performApplicationMutation({
    authenticate: async () => {},
    mutate: async () => {
      throw new FetchError("verification required", "Forbidden", 403)
    },
    reload: async () => response,
  })
  assert.equal(result.status, "error")
  assert.equal(result.retryable, false)
  assert.match(result.message, /Verifica tu correo/)
})

test("invalid input does not retry, reload, or expose private backend details", async () => {
  let reads = 0
  const result = await performApplicationMutation({
    authenticate: async () => {},
    mutate: async () => {
      throw new FetchError("private validation stack", "Bad Request", 400)
    },
    reload: async () => {
      reads++
      return response
    },
  })
  assert.equal(result.status, "error")
  assert.equal(result.retryable, false)
  assert.equal(reads, 0)
  assert.ok(!result.message.includes("private"))
})
