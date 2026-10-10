import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, beforeEach, test } from "node:test";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { unstable_getResponseFromNextConfig: route } = require("next/experimental/testing/server");
const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  process.env.NODE_ENV = "production";
});

after(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

for (const app of ["web", "admin", "vendor"]) {
  const { default: nextConfig } = await import(`../apps/${app}/next.config.ts`);

  test(`${app}: production pages and assets send HSTS behind the HTTPS edge`, async () => {
    for (const path of [
      "/",
      "/login",
      "/seller/login",
      "/_next/static/chunks/app.js",
      "/favicon.ico",
      "/auth/google/callback",
    ]) {
      const url = new URL(path, "https://shop.example.com");
      const response = await route({
        url: url.href,
        nextConfig,
        headers: { host: url.host, "x-forwarded-proto": "https" },
      });

      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("location"), null, path);
      assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000", path);
    }
  });

  test(`${app}: forwarded HTTPS avoids redirect loops and sends HSTS`, async () => {
    const response = await route({
      // TLS terminates at the edge; the URL seen by Next.js can still be HTTP.
      url: "http://shop.example.com/login?next=%2Faccount",
      nextConfig,
      headers: { host: "shop.example.com", "x-forwarded-proto": "https" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  });

  test(`${app}: health checks, loopback and private requests stay reachable`, async () => {
    for (const host of [
      "healthcheck.railway.app",
      "localhost",
      "preview.localhost",
      "127.0.0.1",
      "[::1]",
      "usapeek-web.railway.internal",
    ]) {
      const response = await route({
        url: `http://${host}/`,
        nextConfig,
        headers: { host, "x-forwarded-proto": "http" },
      });

      assert.equal(response.status, 200, host);
      assert.equal(response.headers.get("location"), null, host);
      assert.equal(response.headers.get("strict-transport-security"), null, host);
    }
  });

  test(`${app}: development leaves HTTP and HTTPS untouched`, async () => {
    process.env.NODE_ENV = "development";

    for (const protocol of ["http", "https"]) {
      const response = await route({
        url: `${protocol}://preview.example.com/login`,
        nextConfig,
        headers: { host: "preview.example.com", "x-forwarded-proto": protocol },
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("strict-transport-security"), null);
    }
  });

  if (app === "web") {
    test("web: HSTS preserves tracking privacy headers", async () => {
      const response = await route({
        url: "https://shop.example.com/orders/track",
        nextConfig,
        headers: { host: "shop.example.com", "x-forwarded-proto": "https" },
      });

      assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
      assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0, must-revalidate");
      assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive, nosnippet");
    });
  }
}
