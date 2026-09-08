import { execFileSync } from "node:child_process";
import path from "node:path";

it("loads the shipping workflow using the installed workflow composer", () => {
  // A nested when() passed TypeScript but crashed Medusa while registering routes.
  expect(() =>
    execFileSync(
      process.execPath,
      [
        "-r",
        "ts-node/register/transpile-only",
        "-e",
        "require('./src/workflows/configure-vendor-shipping')",
      ],
      {
        cwd: path.resolve(__dirname, "../../.."),
        timeout: 30_000,
        stdio: "pipe",
      },
    ),
  ).not.toThrow();
}, 35_000);
