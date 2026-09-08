import { execFileSync } from "node:child_process";
import path from "node:path";

it("loads sale checks alongside Mercur's existing cart hooks", () => {
  expect(() =>
    execFileSync(
      process.execPath,
      [
        "-r",
        "ts-node/register/transpile-only",
        "-e",
        [
          "require('@mercurjs/core/workflows/cart/hooks/index')",
          "require('./src/workflows/hooks/stripe-sale-readiness')",
          "require('./src/workflows/hooks/vendor-offer-validation')",
          "require('./src/api/vendor/product-sale-status/middlewares')",
          "require('./src/api/store/product-sale-status/middlewares')",
        ].join(";"),
      ],
      {
        cwd: path.resolve(__dirname, "../../.."),
        timeout: 30_000,
        stdio: "pipe",
      },
    ),
  ).not.toThrow();
}, 35_000);
