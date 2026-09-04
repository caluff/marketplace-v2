import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  ADMIN_SESSION_COOKIE,
  isJwtExpired,
  safeRedirectPath,
  validateCredentials,
} from "../src/lib/auth-utils";

const projectRoot = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, projectRoot), "utf8");

test("validates credentials without revealing operator accounts", () => {
  assert.deepEqual(validateCredentials("invalid", "short"), {
    email: "Ingresa un correo electrónico válido.",
    password: "La contraseña debe tener entre 8 y 256 caracteres.",
  });
  assert.deepEqual(validateCredentials("operator@example.com", "strong-password"), {});
});

test("accepts only safe dashboard return paths", () => {
  assert.equal(safeRedirectPath("/dashboard/orders?id=1", "/dashboard"), "/dashboard/orders?id=1");
  assert.equal(safeRedirectPath("https://evil.example", "/dashboard"), "/dashboard");
  assert.equal(safeRedirectPath("//evil.example", "/dashboard"), "/dashboard");
  assert.equal(safeRedirectPath("/\\evil.example", "/dashboard"), "/dashboard");
  assert.equal(safeRedirectPath("/login", "/dashboard"), "/dashboard");
});

test("detects expired sessions used by route protection", () => {
  const token = (exp: number) =>
    `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
  assert.equal(isJwtExpired(token(Math.floor(Date.now() / 1000) - 1)), true);
  assert.equal(isJwtExpired(token(Math.floor(Date.now() / 1000) + 60)), false);
  assert.equal(isJwtExpired("invalid"), true);
  assert.equal(ADMIN_SESSION_COOKIE, "mv2_admin_user_session");
});

test("wires invalid credentials, reset, restoration and local logout", async () => {
  const actions = await read("src/app/auth-actions.ts");
  const sdk = await read("src/lib/auth-sdk.ts");
  const proxy = await read("src/proxy.ts");

  assert.match(actions, /INVALID_CREDENTIALS/);
  assert.match(actions, /auth\.resetPassword\("user", "emailpass"/);
  assert.match(actions, /auth\.updateProvider\("user", "emailpass"/);
  assert.match(actions, /finally[\s\S]*await clearAdminSession\(\)/);
  assert.match(sdk, /sdk\.admin\.user\.me\(\)/);
  assert.match(proxy, /pathname\.startsWith\("\/dashboard"\)/);
  assert.match(proxy, /response\.cookies\.delete\(ADMIN_SESSION_COOKIE\)/);
});

test("keeps the forms accessible and prevents double submission", async () => {
  const forms = await read("src/components/admin/admin-auth-forms.tsx");

  assert.match(forms, /aria-live="polite"/);
  assert.match(forms, /aria-label={visible \? "Ocultar contraseña" : "Mostrar contraseña"}/);
  assert.match(forms, /autoComplete="email"/);
  assert.match(forms, /disabled={pending}/);
  assert.match(forms, /aria-disabled={pending}/);
});
