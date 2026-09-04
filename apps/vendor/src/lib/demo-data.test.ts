import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  isJwtExpired,
  safeRedirectPath,
  sellerChoice,
  validateCredentials,
} from "./auth-utils";
import { DEMO_DISCLAIMER, demoMetrics, demoOrders } from "./demo-data";
import { vendorRoutes } from "./vendor-routes";

describe("vendor dashboard fixtures", () => {
  it("labels every order and dataset as demonstration content", () => {
    assert.match(DEMO_DISCLAIMER.toLowerCase(), /datos ficticios/);
    assert.ok(demoOrders.length > 0);
    assert.ok(demoOrders.every((order) => order.id.startsWith("DEMO-")));
    assert.ok(demoMetrics.some((metric) => metric.detail.includes("demo")));
  });

  it("keeps navigation inside the seller shell and outside restricted flows", () => {
    const hrefs = vendorRoutes.map((route) => route.href);
    const forbiddenFlows =
      /register|signup|onboarding|stripe|payout|commission/i;

    assert.equal(new Set(hrefs).size, hrefs.length);
    assert.ok(hrefs.every((href) => href.startsWith("/seller")));
    assert.ok(
      vendorRoutes.every((route) => !forbiddenFlows.test(route.label)),
    );
  });
});

describe("vendor authentication", () => {
  it("handles zero, one and multiple seller memberships", () => {
    assert.equal(sellerChoice(0), "none");
    assert.equal(sellerChoice(1), "single");
    assert.equal(sellerChoice(2), "multiple");
  });

  it("validates credentials and internal seller redirects", () => {
    assert.deepEqual(validateCredentials("invalid", "short"), {
      email: "Ingresa un correo electrónico válido.",
      password: "La contraseña debe tener entre 8 y 256 caracteres.",
    });
    assert.deepEqual(validateCredentials("member@example.com", "strong-password"), {});
    assert.equal(safeRedirectPath("/seller/orders?id=1", "/seller"), "/seller/orders?id=1");
    assert.equal(safeRedirectPath("//evil.example", "/seller"), "/seller");
    assert.equal(safeRedirectPath("/seller/login", "/seller"), "/seller");
  });

  it("detects expired sessions", () => {
    const token = (exp: number) =>
      `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
    assert.equal(isJwtExpired(token(Math.floor(Date.now() / 1000) - 1)), true);
    assert.equal(isJwtExpired(token(Math.floor(Date.now() / 1000) + 60)), false);
  });

  it("uses documented Mercur routes and isolates selected sellers", async () => {
    const sdk = await readFile(new URL("./auth-sdk.ts", import.meta.url), "utf8");
    const actions = await readFile(new URL("../app/seller/auth-actions.ts", import.meta.url), "utf8");
    const layout = await readFile(new URL("../app/seller/(workspace)/layout.tsx", import.meta.url), "utf8");

    assert.match(sdk, /sdk\.client\.fetch<.*>\("\/vendor\/sellers"\)/);
    assert.match(sdk, /"\/vendor\/sellers\/select"/);
    assert.match(sdk, /body: { seller_id: sellerId }/);
    assert.match(sdk, /"\/vendor\/members\/me"/);
    assert.match(sdk, /"x-seller-id": sellerId/);
    assert.match(sdk, /error\.status === 401/);
    assert.match(sdk, /error\.status === 403/);
    assert.match(actions, /sdk\.auth\.login\("member", "emailpass"/);
    assert.match(actions, /auth\.resetPassword\("member", "emailpass"/);
    assert.match(actions, /auth\.updateProvider\("member", "emailpass"/);
    assert.match(actions, /finally[\s\S]*await clearVendorSession\(\)/);
    assert.match(layout, /getVendorContext\(\)/);
  });

  it("keeps seller forms accessible and pending-safe", async () => {
    const forms = await readFile(new URL("../components/vendor/vendor-auth-forms.tsx", import.meta.url), "utf8");
    assert.match(forms, /aria-live="polite"/);
    assert.match(forms, /aria-label={visible \? "Ocultar contraseña" : "Mostrar contraseña"}/);
    assert.match(forms, /disabled={pending}/);
    assert.match(forms, /aria-disabled={pending}/);
    assert.match(forms, /type="radio" name="sellerId"/);
  });
});
