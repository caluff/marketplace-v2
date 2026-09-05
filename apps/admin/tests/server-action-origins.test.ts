import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function allowedOrigins(
  mode: "development" | "production",
  configured = "",
  railway = "",
): string[] {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--require",
        "tsx/cjs",
        "-e",
        "const config = require('./next.config.ts').default; console.log(JSON.stringify(config.experimental.serverActions.allowedOrigins))",
      ],
      {
        cwd: new URL("../", import.meta.url),
        env: {
          ...process.env,
          NODE_ENV: mode,
          SERVER_ACTIONS_ALLOWED_ORIGINS: configured,
          RAILWAY_PUBLIC_DOMAIN: railway,
        },
        encoding: "utf8",
      },
    ),
  );
}

test("admin allows only its exact local preview in development", () => {
  assert.deepEqual(allowedOrigins("development"), [
    "marketplace-v2-3.orca.localhost:6136",
  ]);
});

test("admin does not implicitly trust local previews in production", () => {
  assert.deepEqual(allowedOrigins("production"), []);
});

test("admin preserves explicitly configured deployment origins and deduplicates", () => {
  assert.deepEqual(
    allowedOrigins(
      "production",
      "https://admin.example.com, preview.example.com:7443",
      "admin.example.com",
    ),
    ["admin.example.com", "preview.example.com:7443"],
  );
});

test("admin rejects configured origins containing credentials, paths or queries", () => {
  assert.deepEqual(
    allowedOrigins(
      "production",
      "https://user:pass@example.com,https://example.com/path,https://example.com?x=1,ftp://example.com",
    ),
    [],
  );
});
