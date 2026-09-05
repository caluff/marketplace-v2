import assert from "node:assert/strict"
import test from "node:test"
import type { DraftData } from "@marketplace-v2/vendor-onboarding-contracts"
import {
  copyBusinessAddress,
  initialDraft,
  mutationForPayload,
  validMutation,
  validateStep,
} from "./validation"

const options = {
  country_codes: ["us"],
  currency_codes: ["usd"],
  terms_version: "2026-09",
}
const data: DraftData = {
  responsible: {
    first_name: "Alex",
    last_name: "Rivera",
    phone: "+12025550123",
  },
  store: {
    name: "Rivera Studio",
    handle: "rivera-studio",
    description: "Original art prints made in our studio",
    website_url: "https://example.com",
  },
  activity: {
    business_type: "individual",
    company_name: "",
    currency_code: "usd",
    category_ids: ["pcat_art"],
    description: "Original art prints",
    business_address: {
      address_1: "123 Main Street",
      address_2: "",
      city: "Washington",
      province: "dc",
      country_code: "us",
      postal_code: "20001",
    },
  },
}

test("new draft reuses account contact but derives choices from backend options", () => {
  const draft = initialDraft(
    { first_name: "Alex", last_name: "Rivera", phone: data.responsible.phone },
    options,
  )
  assert.equal(draft.responsible.phone, data.responsible.phone)
  assert.equal(draft.activity.currency_code, "usd")
  assert.equal(draft.activity.business_address.country_code, "us")
  assert.deepEqual(draft.activity.category_ids, [])
  const empty = initialDraft(
    { first_name: "", last_name: "", phone: "" },
    { ...options, country_codes: [], currency_codes: [] },
  )
  assert.equal(empty.activity.currency_code, "")
  assert.equal(empty.activity.business_address.country_code, "")
})

test("review validates all steps, current categories and US business address", () => {
  assert.deepEqual(validateStep(data, "review", options, ["pcat_art"]), {})
  const invalid = structuredClone(data)
  invalid.responsible.phone = "+59899123456"
  invalid.activity.business_type = "company"
  invalid.activity.business_address.country_code = "ca"
  invalid.activity.business_address.province = "xx"
  invalid.activity.business_address.postal_code = "invalid"
  invalid.store.website_url = "https://user:password@example.com"
  const errors = validateStep(invalid, "review", options, [])
  for (const field of [
    "responsible.phone",
    "activity.company_name",
    "activity.business_address.country_code",
    "activity.business_address.province",
    "activity.business_address.postal_code",
    "activity.category_ids",
    "store.website_url",
  ])
    assert.ok(errors[field], field)
})

test("responsible step does not require later draft fields", () => {
  const draft = initialDraft(data.responsible, options)
  assert.deepEqual(validateStep(draft, "responsible", options, []), {})
  assert.ok(validateStep(draft, "review", options, ["pcat_art"])["store.name"])
})

test("a proposed category allows submitting without existing catalog categories", () => {
  const draft = structuredClone(data)
  draft.activity.category_ids = []
  draft.activity.category_suggestion = "  Cerámica artesanal  "
  assert.deepEqual(validateStep(draft, "review", options, []), {})
  draft.activity.category_suggestion = " "
  assert.ok(
    validateStep(draft, "activity", options, [])["activity.category_ids"],
  )
})

test("category suggestions are bounded and cannot bypass catalog selection validation", () => {
  const draft = structuredClone(data)
  draft.activity.category_suggestion = "x".repeat(121)
  assert.ok(
    validateStep(draft, "activity", options, ["pcat_art"])[
      "activity.category_suggestion"
    ],
  )
  draft.activity.category_suggestion = "Arte\nCerámica"
  assert.ok(
    validateStep(draft, "activity", options, ["pcat_art"])[
      "activity.category_suggestion"
    ],
  )
  draft.activity.category_suggestion = "Cerámica"
  assert.ok(
    validateStep(draft, "activity", options, [])["activity.category_ids"],
  )
  draft.activity.category_ids = Array.from(
    { length: 11 },
    (_, index) => `pcat_${index}`,
  )
  assert.ok(
    validateStep(draft, "activity", options, draft.activity.category_ids)[
      "activity.category_ids"
    ],
  )
})

test("old drafts without a suggestion remain valid with an existing category", () => {
  const draft = structuredClone(data)
  delete draft.activity.category_suggestion
  assert.deepEqual(validateStep(draft, "review", options, ["pcat_art"]), {})
})

test("store step enforces the submission minimums before saving the next step", () => {
  const draft = structuredClone(data)
  draft.store.handle = "ab"
  draft.store.description = "Too short"
  const errors = validateStep(draft, "store", options, ["pcat_art"])
  assert.ok(errors["store.handle"])
  assert.ok(errors["store.description"])
})

test("copying a buyer address makes an independent snapshot", () => {
  const address = {
    id: "addr_1",
    customer_id: "cus_1",
    address_1: "First",
    address_2: "",
    city: "Washington",
    province: "DC",
    postal_code: "20001",
    country_code: "US",
    is_default_shipping: true,
    is_default_billing: true,
    created_at: new Date(),
    updated_at: new Date(),
  }
  const copied = copyBusinessAddress(address)
  copied.address_1 = "Changed business address"
  assert.equal(address.address_1, "First")
  assert.equal(copied.province, "dc")
  assert.equal(copied.country_code, "us")
})

test("mutation identity persists for exact retries and changes for different data or version", () => {
  let count = 0
  const createId = () => `operation-${++count}`
  const payload = { expected_version: 0, current_step: "store" as const, data }
  const original = mutationForPayload(null, payload, createId)
  assert.equal(
    mutationForPayload(original, structuredClone(payload), createId),
    original,
  )
  assert.notEqual(
    mutationForPayload(original, { ...payload, expected_version: 1 }, createId)
      .id,
    original.id,
  )
  assert.notEqual(
    mutationForPayload(
      original,
      {
        ...payload,
        data: { ...data, store: { ...data.store, name: "Edited" } },
      },
      createId,
    ).id,
    original.id,
  )
})

test("mutation validation rejects non-UUID IDs and unsafe versions", () => {
  const mutation_id = "123e4567-e89b-42d3-a456-426614174000"
  assert.equal(validMutation({ mutation_id, expected_version: 0 }), true)
  for (const expected_version of [
    -1,
    0.5,
    Number.NaN,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    assert.equal(validMutation({ mutation_id, expected_version }), false)
  assert.equal(
    validMutation({ mutation_id: "arbitrary", expected_version: 1 }),
    false,
  )
})
