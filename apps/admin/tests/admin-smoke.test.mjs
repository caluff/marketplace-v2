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
  const adminService = railway
    .split("const admin = service(")[1]
    ?.split("const vendor = service(")[0];
  assert.ok(adminService, "Railway declares an independent admin service");
  assert.match(adminService, /NEXT_PUBLIC_MEDUSA_BACKEND_URL/);
  assert.match(adminService, /\/packages\/vendor-onboarding-contracts\/\*\*/);
});

test("ships the dashboard and functional operator login routes", async () => {
  const dashboard = await read("src/app/dashboard/page.tsx");
  const login = await read("src/app/login/page.tsx");
  const layout = await read("src/app/dashboard/layout.tsx");
  const actions = await read("src/app/auth-actions.ts");
  const completeLogin = await read("src/lib/auth-login.ts");

  assert.match(dashboard, /Panorama del marketplace/);
  assert.match(dashboard, /OverviewMetric/);
  assert.match(dashboard, /Suspense/);
  assert.doesNotMatch(dashboard, /DEMO_SOURCE_LABEL|demo-data/);
  assert.match(login, /AdminLoginForm/);
  assert.match(layout, /getCurrentAdmin/);
  assert.match(layout, /redirect\("\/login\?reason=expired/);
  assert.match(actions, /sdk\.auth\.login\("user", "emailpass"/);
  assert.match(completeLogin, /authenticated\.admin\.user\.me\(\)/);
  assert.doesNotMatch(login, /autenticación final no\s+está conectada/i);
});

test("links operational stores and orders to real routes", async () => {
  const navigation = await read("src/components/admin/navigation.tsx");
  assert.match(navigation, /href: "\/dashboard\/stores"/);
  assert.match(navigation, /href: "\/dashboard\/orders"/);
  assert.doesNotMatch(
    navigation,
    /\/dashboard#stores|conservan sus datos de demostración/,
  );
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
