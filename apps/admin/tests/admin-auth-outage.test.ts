import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { FetchError } from "@medusajs/js-sdk";
import type { HttpTypes } from "@medusajs/types";

import { loginAdminAction } from "../src/app/auth-actions";
import {
  AUTH_SERVICE_UNAVAILABLE,
  INVALID_CREDENTIALS,
  retrieveAdminUser,
} from "../src/lib/auth-service";

const user: HttpTypes.AdminUser = {
  id: "user_test",
  email: "operator@example.test",
  first_name: null,
  last_name: null,
  avatar_url: null,
  metadata: null,
  created_at: "2026-09-05T00:00:00Z",
  updated_at: "2026-09-05T00:00:00Z",
  deleted_at: null,
};

test("session verification returns null only for explicit authentication denial", async () => {
  for (const status of [401, 403]) {
    assert.equal(
      await retrieveAdminUser({
        me: async () => {
          throw new FetchError("Denied", "", status);
        },
      }),
      null,
    );
  }
});

test("outages propagate to the boundary and the same client can recover", async () => {
  const failures = [
    new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }),
    new DOMException("Request timed out", "TimeoutError"),
    ...[400, 404, 429, 500, 502, 503].map(
      (status) => new FetchError("Request failed", "", status),
    ),
    new FetchError("No response status"),
  ];
  for (const error of failures) {
    let unavailable = true;
    const client = {
      me: async () => {
        if (unavailable) throw error;
        return { user };
      },
    };
    await assert.rejects(retrieveAdminUser(client), (thrown) => thrown === error);
    unavailable = false;
    assert.equal(await retrieveAdminUser(client), user);
  }
  await assert.rejects(retrieveAdminUser(undefined), /not configured/);
});

test("login classifies failures at both the credentials and user verification requests", async (t) => {
  const originalUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL;
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = "http://admin-backend.invalid";
  t.after(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL;
    else process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = originalUrl;
  });

  const form = new FormData();
  form.set("email", "operator@example.test");
  form.set("password", "test-password-only");

  for (const stage of ["credentials", "user"] as const) {
    for (const status of [401, 403, 500, 503, "transport"] as const) {
      await t.test(`${stage}: ${status}`, async (subtest) => {
        const paths: string[] = [];
        subtest.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
          const url = new URL(input instanceof Request ? input.url : input);
          assert.equal(url.origin, "http://admin-backend.invalid");
          paths.push(url.pathname);
          if (stage === "user" && paths.length === 1) {
            return Response.json({ token: "test-token-only" });
          }
          if (status === "transport") throw new TypeError("fetch failed");
          return Response.json({ message: "Private backend detail" }, { status });
        });
        const result = await loginAdminAction({ status: "idle" }, form);
        assert.deepEqual(result, {
          status: "error",
          message: status === 401 || status === 403
            ? INVALID_CREDENTIALS
            : AUTH_SERVICE_UNAVAILABLE,
        });
        assert.deepEqual(paths, stage === "user"
          ? ["/auth/user/emailpass", "/admin/users/me"]
          : ["/auth/user/emailpass"]);
      });
    }
  }
});

test("dashboard layout failures have a parent boundary and retry preserves the current URL", async () => {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const boundary = await read("../src/app/error.tsx");
  const sdk = await read("../src/lib/auth-sdk.ts");
  const currentAdmin = sdk.slice(sdk.indexOf("export async function getCurrentAdmin"));

  assert.match(boundary, /"use client"/);
  assert.match(boundary, /<Card[^>]+role="alert"/);
  assert.match(boundary, /window\.location\.reload\(\)/);
  assert.match(currentAdmin, /if \(!token\) return null/);
  assert.match(currentAdmin, /return retrieveAdminUser\(sdk\?\.admin\.user\)/);
  assert.doesNotMatch(currentAdmin, /clearAdminSession|\.delete\(|catch/);
});
