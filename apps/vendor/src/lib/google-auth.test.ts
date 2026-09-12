import assert from "node:assert/strict";
import { test } from "node:test";
import type Medusa from "@medusajs/js-sdk";
import {
  completeGoogleAuthentication,
  googleAuthorizationUrl,
  googleCallbackUrl,
  validGoogleAttempt,
  googleSessionHash,
  validGoogleLinkSession,
} from "./google-auth";

test("Google redirects reject untrusted hosts, missing state, and unsafe callbacks", () => {
  const callbackUrl = "http://localhost:7000/auth/google/callback";
  assert.equal(googleAuthorizationUrl("https://accounts.google.com.evil.test/auth?state=abc", callbackUrl), null);
  assert.equal(googleAuthorizationUrl("http://accounts.google.com/auth?state=abc", callbackUrl), null);
  assert.equal(googleAuthorizationUrl("https://accounts.google.com/auth", callbackUrl), null);
  assert.equal(googleAuthorizationUrl(`https://accounts.google.com/o/oauth2/v2/auth?state=abc&response_type=code&redirect_uri=${encodeURIComponent(callbackUrl)}`, callbackUrl)?.state, "abc");
  assert.equal(googleCallbackUrl("http://localhost:7001/auth/google/callback"), "http://localhost:7001/auth/google/callback");
  assert.equal(googleCallbackUrl("http://public.example/auth/google/callback"), null);
  assert.equal(googleCallbackUrl("https://example.com/auth/google/callback?next=evil"), null);
});

test("callbacks require the same browser OAuth attempt", () => {
  const attempt = { state: "expected", next: "/destination", link: false, createdAt: Date.now() };
  assert.equal(validGoogleAttempt(null, "expected"), false);
  assert.equal(validGoogleAttempt(attempt, "expected", attempt.createdAt + 600_001), false);
  assert.equal(validGoogleAttempt(attempt, "expected", attempt.createdAt - 1), false);
  assert.equal(validGoogleAttempt(attempt, null), false);
  assert.equal(validGoogleAttempt(attempt, "other-browser"), false);
  assert.equal(validGoogleAttempt(attempt, "expected"), true);
  assert.equal(validGoogleAttempt({ ...attempt, link: true }, "expected"), false);
  assert.equal(validGoogleAttempt({ ...attempt, link: true, sessionHash: "a".repeat(64) }, "expected"), true);
});

test("completion refreshes the canonical token and preserves MFA", async () => {
  const requests: unknown[] = [];
  const challenge = { mfa_required: true as const, token: "partial", mfa_challenge: { id: "challenge", methods: ["totp"] } };
  const sdk = { auth: { callback: async (...args: unknown[]) => { requests.push(args); return "google-token"; } } } as unknown as Medusa;
  const tokens: string[] = [];
  const createSdk = (token: string) => {
    tokens.push(token);
    return {
      client: { fetch: async (_path: string, options: unknown) => { requests.push(options); return { status: "complete", token: "canonical-token" }; } },
      auth: { refresh: async () => challenge },
    } as unknown as Medusa;
  };
  assert.equal(await completeGoogleAuthentication(sdk, createSdk, "code", "state", "existing-session"), challenge);
  assert.deepEqual(tokens, ["google-token", "canonical-token"]);
  assert.deepEqual(requests[0], ["member", "google", { code: "code", state: "state" }]);
  assert.deepEqual(requests[1], { method: "POST", body: { actor_type: "member", existing_token: "existing-session" } });
});

test("an unlinked account does not receive a refreshed session", async () => {
  let refreshes = 0;
  const sdk = { auth: { callback: async () => "google-token" } } as unknown as Medusa;
  const createSdk = () => ({
    client: { fetch: async () => ({ status: "link_required" }) },
    auth: { refresh: async () => { refreshes++; return { token: "forbidden" }; } },
  }) as unknown as Medusa;
  assert.deepEqual(await completeGoogleAuthentication(sdk, createSdk, "code", "state"), { status: "link_required" });
  assert.equal(refreshes, 0);
});

test("native callback verification is returned before actor completion", async () => {
  const challenge = { verification_required: true as const, token: "partial" };
  const sdk = { auth: { callback: async () => challenge } } as unknown as Medusa;
  assert.equal(await completeGoogleAuthentication(sdk, () => { throw new Error("must not complete partial authentication"); }, "code", "state"), challenge);
});


test("linking does not switch to another Google account through its MFA challenge", async () => {
  const challenge = { mfa_required: true as const, token: "partial", mfa_challenge: { id: "other-account", methods: ["totp"] } };
  const sdk = { auth: { callback: async () => challenge } } as unknown as Medusa;
  await assert.rejects(completeGoogleAuthentication(sdk, () => { throw new Error("must not complete"); }, "code", "state", "existing-session"), /google_link_requires_complete_authentication/);
});

test("link consent remains bound to the account active when Google was started", () => {
  const attempt = { state: "state", next: "/destination", link: true, createdAt: Date.now(), sessionHash: googleSessionHash("original-session") };
  assert.equal(validGoogleLinkSession(attempt, "original-session"), true);
  assert.equal(validGoogleLinkSession(attempt, "switched-session"), false);
  assert.equal(validGoogleLinkSession(attempt, undefined), false);
});

test("an already linked canonical identity can finish its native MFA", async () => {
  const token = (id: string) => `header.${Buffer.from(JSON.stringify({ auth_identity_id: id })).toString("base64url")}.signature`;
  const challenge = { mfa_required: true as const, token: token("same-identity"), mfa_challenge: { id: "challenge", methods: ["totp"] } };
  const sdk = { auth: { callback: async () => challenge } } as unknown as Medusa;
  assert.equal(await completeGoogleAuthentication(sdk, () => { throw new Error("must not complete partial authentication"); }, "code", "state", token("same-identity")), challenge);
});
