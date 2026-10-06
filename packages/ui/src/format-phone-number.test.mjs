import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPhoneNumber } from "./format-phone-number.ts";

test("formats US numbers with their country code, parentheses and hyphen", () => {
  for (const value of [
    "+17542808027",
    "7542808027",
    "(754) 280-8027",
    "  +17542808027  ",
  ]) {
    assert.equal(formatPhoneNumber(value), "+1 (754) 280-8027");
  }
});

test("preserves the country code and format of international numbers", () => {
  assert.equal(formatPhoneNumber("+442079460018"), "+44 20 7946 0018");
});

test("does not lose extensions", () => {
  assert.equal(
    formatPhoneNumber("+17542808027 ext. 123"),
    "+1 (754) 280-8027 ext. 123",
  );
});

test("leaves incomplete or unparseable values visible without guessing digits", () => {
  for (const value of [
    "75428",
    "invalid",
    "Call +17542808027",
    "+999123456789",
  ]) {
    assert.equal(formatPhoneNumber(value), value);
  }
});

test("returns null for missing phone numbers so callers choose their empty label", () => {
  for (const value of [undefined, null, "", "   "]) {
    assert.equal(formatPhoneNumber(value), null);
  }
});
