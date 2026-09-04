import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

test("pins the requested Next.js version and exposes workspace scripts", async () => {
  const packageJson = JSON.parse(await read("package.json"));

  assert.equal(packageJson.dependencies.next, "16.3.4");
  assert.equal(packageJson.packageManager, "pnpm@12.0.0");
  assert.equal(packageJson.scripts.dev, "next dev --port 7000");
});

test("allows only configured Server Action origins behind Railway", async () => {
  const nextConfig = await read("next.config.ts");
  const railway = await read("../../.railway/railway.ts");

  assert.match(nextConfig, /serverActions/);
  assert.match(nextConfig, /RAILWAY_PUBLIC_DOMAIN/);
  assert.match(nextConfig, /SERVER_ACTIONS_ALLOWED_ORIGINS/);
  assert.doesNotMatch(nextConfig, /allowedOrigins:\s*\[\s*["']\*["']/);
  assert.match(
    railway,
    /service\("@marketplace-v2\/admin"[\s\S]*NEXT_PUBLIC_MEDUSA_BACKEND_URL/,
  );
});

test("ships the dashboard and functional operator login routes", async () => {
  const dashboard = await read("src/app/dashboard/page.tsx");
  const login = await read("src/app/login/page.tsx");
  const layout = await read("src/app/dashboard/layout.tsx");
  const actions = await read("src/app/auth-actions.ts");

  assert.match(dashboard, /Panorama del marketplace/);
  assert.match(dashboard, /DEMO_SOURCE_LABEL/);
  assert.match(login, /AdminLoginForm/);
  assert.match(layout, /getCurrentAdmin/);
  assert.match(layout, /redirect\("\/login\?reason=expired/);
  assert.match(actions, /sdk\.auth\.login\("user", "emailpass"/);
  assert.match(actions, /authenticated\.admin\.user\.me\(\)/);
  assert.doesNotMatch(login, /autenticación final no\s+está conectada/i);
});

test("does not expose public operator registration", async () => {
  const actions = await read("src/app/auth-actions.ts");
  const login = await read("src/app/login/page.tsx");

  assert.doesNotMatch(actions, /auth\.register/);
  assert.doesNotMatch(login, /href=["']\/register/);
});

test("marks synthetic records with DEMO identifiers", async () => {
  const fixtures = await read("src/lib/demo-data.ts");

  assert.match(fixtures, /DEMO-PR-104/);
  assert.match(fixtures, /Producto de demostración/);
  assert.match(fixtures, /Vendedor de demostración/);
});
