import assert from "node:assert/strict"
import test from "node:test"
import type {
  ApplicationResponse,
  ApplicationStatus,
  ApplicationView,
} from "@marketplace-v2/vendor-onboarding-contracts"
import {
  applicationNavigation,
  APPLICATION_LOGIN_PATH,
  STATUS_LABELS,
  vendorLoginUrl,
} from "./presentation"
import { safeRedirectPath } from "../../lib/auth-utils"

test("vendor login uses only a configured trusted origin and never transfers tokens", () => {
  assert.equal(
    vendorLoginUrl("https://vendors.example.com"),
    "https://vendors.example.com/seller/login?next=%2Fseller",
  )
  assert.equal(
    vendorLoginUrl("http://localhost:3002"),
    "http://localhost:3002/seller/login?next=%2Fseller",
  )
  for (const value of [
    undefined,
    "",
    "javascript:alert(1)",
    "//evil.example",
    "https://user:pass@example.com",
    "https://example.com/path",
    "https://example.com?token=secret",
    "https://example.com#token",
    "http://example.com",
  ])
    assert.equal(vendorLoginUrl(value), null, value)
})

test("application login return path survives safe redirect validation", () => {
  const url = new URL(APPLICATION_LOGIN_PATH, "https://store.example.com")
  assert.equal(
    safeRedirectPath(url.searchParams.get("next"), "/account"),
    "/account/sell",
  )
  for (const value of [
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "/login",
  ])
    assert.equal(safeRedirectPath(value, "/account/sell"), "/account/sell")
})

test("account CTA distinguishes drafts, corrections, terminal decisions, and vendor access", () => {
  const expected: Record<ApplicationStatus, string> = {
    draft: "Continuar solicitud",
    changes_requested: "Corregir solicitud",
    submitted: "Ver solicitud",
    rejected: "Ver solicitud",
    approved: "Mi tienda",
  }
  assert.equal(applicationNavigation(null).label, "Vender en Marketplace V2")
  for (const [status, label] of Object.entries(expected)) {
    const response: ApplicationResponse = {
      application: {
        id: "app_1",
        status,
        submission_revision: 1,
      } as ApplicationView,
      applicant: {
        email: "person@example.com",
        email_verified: true,
        existing_vendor_access: false,
      },
      unread_count: 3,
    }
    assert.deepEqual(applicationNavigation(response), {
      label,
      unreadCount: 3,
      ...(status === "draft" || status === "changes_requested"
        ? { pendingKey: `app_1:${status}:1` }
        : {}),
    })
    assert.ok(STATUS_LABELS[status as ApplicationStatus])
  }
  assert.equal(
    applicationNavigation({
      application: null,
      applicant: {
        email: "person@example.com",
        email_verified: true,
        existing_vendor_access: true,
      },
      unread_count: 0,
    }).label,
    "Mi tienda",
  )
})

test("pending reminder survives draft saves but changes for a new correction cycle", () => {
  const response: ApplicationResponse = {
    application: {
      id: "app_1",
      status: "draft",
      submission_revision: 0,
      version: 1,
    } as ApplicationView,
    applicant: {
      email: "person@example.com",
      email_verified: true,
      existing_vendor_access: false,
    },
    unread_count: 0,
  }
  const key = applicationNavigation(response).pendingKey
  assert.ok(key)
  assert.equal(
    applicationNavigation({
      ...response,
      application: { ...response.application!, version: 2 },
    }).pendingKey,
    key,
  )
  assert.notEqual(
    applicationNavigation({
      ...response,
      application: {
        ...response.application!,
        status: "changes_requested",
        submission_revision: 1,
      },
    }).pendingKey,
    key,
  )
  assert.equal(
    applicationNavigation({
      ...response,
      applicant: { ...response.applicant, existing_vendor_access: true },
    }).pendingKey,
    undefined,
  )
  assert.equal(applicationNavigation(null).pendingKey, undefined)
})
