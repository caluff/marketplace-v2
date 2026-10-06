import assert from "node:assert/strict"
import test from "node:test"

import { installGoogleOneTapDevDiagnostics } from "./google-one-tap-diagnostics.ts"

const tokenUnavailable =
  "[GSI_LOGGER]: FedCM get() rejects with NetworkError: Error retrieving a token."

function diagnosticConsole() {
  const errors = []
  const warnings = []
  const logger = {
    error(...args) {
      assert.equal(this, logger)
      errors.push(args)
    },
    warn(...args) {
      assert.equal(this, logger)
      warnings.push(args)
    },
  }
  return { logger, errors, warnings }
}

test("the exact optional One Tap diagnostic becomes a visible console warning", () => {
  const { logger, errors, warnings } = diagnosticConsole()
  installGoogleOneTapDevDiagnostics(logger)
  logger.error(tokenUnavailable)
  assert.deepEqual(errors, [])
  assert.deepEqual(warnings, [[tokenUnavailable]])
})

test("application errors and other Google failures still reach the error handler", () => {
  const { logger, errors, warnings } = diagnosticConsole()
  installGoogleOneTapDevDiagnostics(logger)
  const failure = new Error("Customer profile request failed")
  const messages = [
    failure,
    new Error(tokenUnavailable),
    "[GSI_LOGGER]: The given origin is not allowed for the given client ID.",
    "[GSI_LOGGER]: FedCM get() rejects with IdentityCredentialError: Error retrieving a token.",
    "[GSI_LOGGER]: FedCM get() rejects with NetworkError: Failed to fetch.",
    "FedCM get() rejects with NetworkError: Error retrieving a token.",
  ]
  for (const message of messages) logger.error(message)
  assert.deepEqual(
    errors,
    messages.map((message) => [message]),
  )
  assert.deepEqual(warnings, [])
})

test("structured errors with extra context are forwarded unchanged", () => {
  const { logger, errors, warnings } = diagnosticConsole()
  installGoogleOneTapDevDiagnostics(logger)
  const context = { operation: "authenticate" }
  logger.error(tokenUnavailable, context)
  logger.error("Authentication failed: %s", "Forbidden")
  assert.deepEqual(errors, [
    [tokenUnavailable, context],
    ["Authentication failed: %s", "Forbidden"],
  ])
  assert.deepEqual(warnings, [])
})

test("StrictMode and remounts do not install duplicate console wrappers", () => {
  const { logger, errors, warnings } = diagnosticConsole()
  installGoogleOneTapDevDiagnostics(logger)
  const handler = logger.error
  installGoogleOneTapDevDiagnostics(logger)
  assert.equal(logger.error, handler)
  logger.error(tokenUnavailable)
  logger.error("Application failure")
  assert.deepEqual(warnings, [[tokenUnavailable]])
  assert.deepEqual(errors, [["Application failure"]])
})
