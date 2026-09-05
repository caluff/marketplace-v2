import assert from "node:assert/strict";
import test from "node:test";
import {
  isProductReviewId,
  parseProductReviewDecision,
  parseProductReviewFilters,
  productReviewHref,
} from "../src/features/product-review/helpers";

test("product queue defaults to proposed without accepting arbitrary statuses or offsets", () => {
  assert.deepEqual(
    parseProductReviewFilters({ status: "constructor", offset: "-1" }),
    { status: "proposed", offset: 0, limit: 20, q: "" },
  );
  assert.equal(
    parseProductReviewFilters({ status: "all", offset: "1.5" }).status,
    "all",
  );
  assert.equal(parseProductReviewFilters({ offset: "1.5" }).offset, 0);
  assert.equal(parseProductReviewFilters({ q: "x".repeat(101) }).q.length, 100);
});

test("product pagination encodes search and preserves status", () => {
  const url = new URL(
    productReviewHref(
      parseProductReviewFilters({ status: "published", q: "a&status=draft" }),
      20,
    ),
    "https://admin.example.test",
  );
  assert.equal(url.searchParams.get("status"), "published");
  assert.equal(url.searchParams.get("q"), "a&status=draft");
  assert.equal(url.searchParams.get("offset"), "20");
});

test("moderation only accepts the verified native operations and safe IDs", () => {
  for (const value of [
    "publish",
    "request_changes",
    "reject",
    "confirm_change",
    "cancel_change",
  ])
    assert.equal(parseProductReviewDecision(value), value);
  assert.equal(parseProductReviewDecision("delete"), null);
  assert.equal(parseProductReviewDecision(null), null);
  assert.equal(isProductReviewId("prod_01TEST"), true);
  assert.equal(isProductReviewId("../sellers"), false);
});
