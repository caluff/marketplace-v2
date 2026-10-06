import assert from "node:assert/strict";
import { test } from "node:test";
import {
  profileLoginDestination,
  profileReturnPath,
} from "./profile-completion";

test("missing names open profile completion and preserve the requested destination", () => {
  const next = "/dashboard/orders?status=pending#recent";
  for (const firstName of [undefined, null, "", "   "]) {
    const destination = new URL(
      profileLoginDestination(firstName, next),
      "https://panel.invalid",
    );
    assert.equal(destination.pathname, "/dashboard/settings");
    assert.equal(destination.searchParams.get("profile"), "complete");
    assert.equal(destination.searchParams.get("next"), next);
  }
});

test("a saved name continues to the requested view without requiring a surname", () => {
  assert.equal(
    profileLoginDestination(" Daniel ", "/dashboard/orders"),
    "/dashboard/orders",
  );
});

test("completion cannot redirect outside the panel or back into authentication", () => {
  for (const next of [
    "https://other.invalid",
    "//other.invalid",
    "/\\\\other.invalid",
    "/orders\u000a",
    "/login",
    "/login/nested",
  ]) {
    assert.equal(profileReturnPath(next), "/dashboard");
    const destination = new URL(
      profileLoginDestination("", next),
      "https://panel.invalid",
    );
    assert.equal(destination.searchParams.get("next"), "/dashboard");
  }
});

test("completion avoids redirect loops when the requested view is settings", () => {
  for (const next of [
    "/dashboard/settings",
    "/dashboard/settings/",
    "/dashboard/settings?profile=complete&next=%2Forders#profile",
  ]) {
    assert.equal(profileReturnPath(next), "/dashboard");
  }
  assert.equal(profileReturnPath(undefined), "/dashboard");
});
