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

test("ships the dashboard and non-functional login routes", async () => {
  const dashboard = await read("src/app/dashboard/page.tsx");
  const login = await read("src/app/login/page.tsx");

  assert.match(dashboard, /Panorama del marketplace/);
  assert.match(dashboard, /DEMO_SOURCE_LABEL/);
  assert.match(login, /autenticación final no\s+está conectada/);
  assert.match(login, /disabled/);
});

test("marks synthetic records with DEMO identifiers", async () => {
  const fixtures = await read("src/lib/demo-data.ts");

  assert.match(fixtures, /DEMO-PR-104/);
  assert.match(fixtures, /Producto de demostración/);
  assert.match(fixtures, /Vendedor de demostración/);
});
