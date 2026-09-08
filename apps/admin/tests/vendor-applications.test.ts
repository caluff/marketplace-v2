import assert from "node:assert/strict";
import test from "node:test";

import {
  applicationDate,
  applicationListHref,
  isApplicationId,
  parseApplicationFilters,
  parseReviewInput,
} from "../src/features/vendor-applications/helpers";

const mutationId = "702c9fb4-7f77-4ed9-b4e6-1cb34c2b6d74";

function reviewForm(decision: string, reason = "") {
  const form = new FormData();
  form.set("decision", decision);
  form.set("reason", reason);
  form.set("expected_version", "3");
  form.set("mutation_id", mutationId);
  return form;
}

test("queue filters bound query size, accept only known states and nonnegative integer offsets", () => {
  assert.deepEqual(
    parseApplicationFilters({ status: "published", offset: "-20", q: ["bad"] }),
    {
      status: "submitted",
      offset: 0,
      q: "",
      limit: 20,
    },
  );
  assert.equal(parseApplicationFilters({ offset: "1.3" }).offset, 0);
  assert.equal(parseApplicationFilters({ offset: "Infinity" }).offset, 0);
  assert.equal(
    parseApplicationFilters({ status: "constructor" }).status,
    "submitted",
  );
  const valid = parseApplicationFilters({
    status: "approved",
    offset: "20",
    q: `  ${"x".repeat(120)}  `,
  });
  assert.equal(valid.status, "approved");
  assert.equal(valid.offset, 20);
  assert.equal(valid.q.length, 100);
});

test("pagination preserves filters and encodes user search content", () => {
  const href = applicationListHref(
    parseApplicationFilters({ q: "shop&status=rejected", status: "submitted" }),
    20,
  );
  const url = new URL(href, "https://admin.example.test");
  assert.equal(url.pathname, "/dashboard/vendor-applications");
  assert.equal(url.searchParams.get("status"), "submitted");
  assert.equal(url.searchParams.get("q"), "shop&status=rejected");
  assert.equal(url.searchParams.get("offset"), "20");
});

test("review payload preserves the mutation identity/version and excludes approval reasons", () => {
  assert.deepEqual(
    parseReviewInput(reviewForm("approve", "Unsubmitted private text")),
    {
      body: {
        mutation_id: mutationId,
        expected_version: 3,
        decision: "approve",
      },
    },
  );
});

test("corrections and rejection require an actionable, bounded explanation", () => {
  for (const decision of ["request_changes", "reject"]) {
    assert.ok("error" in parseReviewInput(reviewForm(decision, "  ")));
    assert.ok(
      "error" in parseReviewInput(reviewForm(decision, "x".repeat(2001))),
    );
    const parsed = parseReviewInput(
      reviewForm(decision, "  Corrige la dirección comercial.  "),
    );
    assert.ok("body" in parsed);
    assert.notEqual(parsed.body.decision, "approve");
    assert.ok("reason" in parsed.body);
    assert.equal(parsed.body.reason, "Corrige la dirección comercial.");
  }
});

test("review rejects forged decisions, missing versions and invalid mutation IDs", () => {
  assert.ok("error" in parseReviewInput(reviewForm("approved")));
  for (const version of ["", "0", "-1", "1.5", "9007199254740992"]) {
    const form = reviewForm("approve");
    form.set("expected_version", version);
    assert.ok("error" in parseReviewInput(form));
  }
  const form = reviewForm("approve");
  form.set("mutation_id", "another-request");
  assert.ok("error" in parseReviewInput(form));
});

test("route IDs cannot inject another API path and dates handle missing values", () => {
  assert.equal(isApplicationId("vapp_01TEST"), true);
  for (const id of ["../sellers", "a?fields=*", "a/b", "", "a".repeat(101)])
    assert.equal(isApplicationId(id), false);
  assert.equal(applicationDate(null), "—");
  assert.equal(applicationDate("invalid"), "—");
  assert.equal(applicationDate("2026-02-30T12:00:00Z"), "—");
  assert.notEqual(applicationDate("2026-09-04T12:00:00Z"), "—");
});

test("application timestamps keep the UTC day across explicit offsets", () => {
  assert.equal(
    applicationDate("2026-09-03T20:30:00-04:00"),
    "4 sept 2026, 0:30",
  );
  assert.equal(
    applicationDate("2026-09-03T20:30:00-04:00"),
    applicationDate("2026-09-04T00:30:00Z"),
  );
});
