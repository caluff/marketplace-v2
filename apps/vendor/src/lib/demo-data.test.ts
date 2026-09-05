import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { FetchError } from "@medusajs/js-sdk";

import { loginVendorAction } from "../app/seller/auth-actions";
import { resolveVendorContextError } from "./auth-sdk";
import type { SellerMemberDTO } from "@mercurjs/types";
import { loadVendorMembershipContext } from "./vendor-context";
import {
  isJwtExpired,
  safeRedirectPath,
  sellerChoice,
  validateCredentials,
} from "./auth-utils";
import { DEMO_DISCLAIMER, demoMetrics, demoOrders } from "./demo-data";
import { vendorRoutes } from "./vendor-routes";

describe("vendor context loading", () => {
  function membership(status = "open", active = true, sellerId = "seller_current") {
    return {
      seller_id: sellerId,
      seller: { id: sellerId, status, name: "Test store", status_reason: null },
      member: { is_active: active },
    } as SellerMemberDTO;
  }

  it("reuses the authenticated list without requesting the same membership again", async () => {
    const current = membership();
    const calls: string[] = [];
    const loading = loadVendorMembershipContext("seller_current", () => {
      calls.push("list");
      return Promise.resolve([current, membership("open", true, "seller_other")]);
    }, () => {
      calls.push("current");
      return Promise.resolve(current);
    });
    assert.deepEqual(await loading, { status: "authenticated", membership: current, membershipCount: 2 });
    assert.deepEqual(calls, ["list"]);
  });

  for (const status of ["pending_approval", "suspended", "terminated"]) {
    it(`does not authorize a ${status} seller or make an unnecessary fallback read`, async () => {
      const unavailable = membership(status);
      const expected = { status: "seller_unavailable", sellerStatus: status, sellerName: "Test store", reason: null };
      assert.deepEqual(await loadVendorMembershipContext("seller_current", async () => [unavailable], async () => { throw new Error("must not retrieve"); }), expected);
    });
  }

  it("preserves inactive membership checks on the list and missing-membership fallback", async () => {
    const inactive = membership("open", false);
    assert.deepEqual(await loadVendorMembershipContext("seller_current", async () => [inactive], async () => membership()), { status: "member_inactive" });
    assert.deepEqual(await loadVendorMembershipContext("seller_current", async () => [], async () => inactive), { status: "member_inactive" });
  });

  it("rejects mismatched or missing membership and retains terminated status", async () => {
    assert.deepEqual(await loadVendorMembershipContext("seller_current", async () => [{ ...membership(), seller_id: "seller_other" }], async () => membership()), { status: "forbidden" });
    assert.deepEqual(await loadVendorMembershipContext("seller_current", async () => [membership("open", true, "seller_other")], async () => membership("terminated", true, "seller_other")), { status: "seller_missing" });
    assert.deepEqual(await loadVendorMembershipContext("seller_current", async () => [], async () => membership()), { status: "seller_missing" });
    assert.deepEqual(await loadVendorMembershipContext("seller_current", async () => [], async () => membership("terminated")), { status: "seller_unavailable", sellerStatus: "terminated", sellerName: "Test store", reason: null });
  });

  it("propagates endpoint failures without granting access or converting outages to expired sessions", async () => {
    const failure = new TypeError("fetch failed");
    await assert.rejects(loadVendorMembershipContext("seller_current", async () => { throw failure; }, async () => membership()), (error) => error === failure);
    await assert.rejects(loadVendorMembershipContext("seller_current", async () => [], async () => { throw failure; }), (error) => error === failure);
  });

  it("uses current membership state on a new load instead of retaining previously granted access", async () => {
    let current = { ...membership(), role_id: "seller_support" };
    const load = () => loadVendorMembershipContext("seller_current", async () => [current], async () => { throw new Error("must not retrieve"); });
    const allowed = await load();
    assert.equal(allowed.status, "authenticated");
    if (allowed.status === "authenticated") assert.equal(allowed.membership.role_id, "seller_support");
    current = { ...membership("suspended"), role_id: "seller_support" };
    assert.equal((await load()).status, "seller_unavailable");
  });
});

describe("vendor Server Action origins", () => {
  function allowedOrigins(mode: "development" | "production", configured = "", railway = ""): string[] {
    return JSON.parse(execFileSync(process.execPath, [
      "--require", "tsx/cjs", "-e",
      "const config = require('./next.config.ts').default; console.log(JSON.stringify(config.experimental.serverActions.allowedOrigins))",
    ], {
      cwd: new URL("../../", import.meta.url),
      env: { ...process.env, NODE_ENV: mode, SERVER_ACTIONS_ALLOWED_ORIGINS: configured, RAILWAY_PUBLIC_DOMAIN: railway },
      encoding: "utf8",
    }));
  }

  it("allows only the exact vendor preview in development", () => {
    assert.deepEqual(allowedOrigins("development"), ["marketplace-v2-2.orca.localhost:6136"]);
  });

  it("does not allow the local preview implicitly in production", () => {
    assert.deepEqual(allowedOrigins("production"), []);
  });

  it("preserves explicit deployment hosts, ports and deduplication", () => {
    assert.deepEqual(allowedOrigins("production", "https://seller.example.com, preview.example.com:7443", "seller.example.com"), [
      "seller.example.com", "preview.example.com:7443",
    ]);
  });

  it("rejects configured URLs with credentials, paths or query strings", () => {
    assert.deepEqual(allowedOrigins("production", "https://user:pass@example.com,https://example.com/path,https://example.com?x=1,ftp://example.com"), []);
  });
});

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
  it("does not report a login outage as invalid credentials", async (t) => {
    const originalUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL;
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = "http://vendor-backend.invalid";
    t.after(() => {
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL;
      else process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = originalUrl;
    });
    const form = new FormData();
    form.set("email", "seller@example.test");
    form.set("password", "test-password-only");

    for (const status of [401, 403, 500, 503, "transport"] as const) {
      await t.test(String(status), async (subtest) => {
        subtest.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
          const url = new URL(input instanceof Request ? input.url : input);
          assert.equal(url.href, "http://vendor-backend.invalid/auth/member/emailpass");
          if (status === "transport") throw new TypeError("fetch failed");
          return Response.json({ message: "Private backend detail" }, { status });
        });
        const result = await loginVendorAction({ status: "idle" }, form);
        assert.equal(result.status, "error");
        assert.match(result.message ?? "", status === 401 || status === 403
          ? /Revisa el correo y la contraseña/
          : /No pudimos conectar con el servicio de acceso/);
        assert.doesNotMatch(result.message ?? "", /Private backend detail/);
      });
    }
  });

  it("distinguishes explicit access denials and missing sellers from outages", () => {
    for (const [status, expected] of [
      [401, "unauthenticated"],
      [403, "forbidden"],
      [404, "seller_missing"],
    ] as const) {
      assert.deepEqual(resolveVendorContextError(new FetchError("Denied", "", status)), {
        status: expected,
      });
    }
    for (const error of [
      new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }),
      new DOMException("Request timed out", "TimeoutError"),
      new Error("configuration_missing"),
      ...[400, 429, 500, 502, 503].map(
        (status) => new FetchError("Request failed", "", status),
      ),
      new FetchError("No response status"),
    ]) {
      assert.throws(() => resolveVendorContextError(error), (thrown) => thrown === error);
    }
  });

  it("catches workspace layout and login failures in the seller parent without clearing cookies", async () => {
    const sdk = await readFile(new URL("./auth-sdk.ts", import.meta.url), "utf8");
    const context = sdk.slice(sdk.indexOf("export const getVendorContext"));
    const boundary = await readFile(new URL("../app/seller/error.tsx", import.meta.url), "utf8");

    assert.match(context, /return resolveVendorContextError\(error\)/);
    assert.doesNotMatch(context, /clearVendorSession|clearVendorSeller|\.delete\(/);
    assert.match(boundary, /"use client"/);
    assert.match(boundary, /<Card[^>]+role="alert"/);
    assert.match(boundary, /window\.location\.reload\(\)/);
  });

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

    assert.match(sdk, /"\/vendor\/sellers"/);
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
