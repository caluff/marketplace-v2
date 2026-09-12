import assert from "node:assert/strict";
import test from "node:test";
import { storefrontSessionCode, trustedStorefrontOrigin } from "./storefront-session";

test("only the exact configured storefront may post a seller handoff", () => {
  assert.equal(trustedStorefrontOrigin("https://store.example.com", "https://store.example.com", true), true);
  for (const origin of [null, "null", "https://evil.example.com", "https://store.example.com.evil.test", "http://store.example.com", "https://store.example.com:8443"]) assert.equal(trustedStorefrontOrigin(origin, "https://store.example.com", true), false);
  assert.equal(trustedStorefrontOrigin("http://localhost:3000", undefined, false), true);
  assert.equal(trustedStorefrontOrigin("http://localhost:3000", undefined, true), false);
});

test("only one bounded one-use code is accepted from the POST body", () => {
  const code = "a".repeat(64);
  assert.equal(storefrontSessionCode(`code=${code}`), code);
  for (const body of ["", `code=${code}&code=${code}`, `code=${code}&next=https://evil.test`, "code=not-a-code", "code=" + "a".repeat(300)]) assert.equal(storefrontSessionCode(body), null);
});
