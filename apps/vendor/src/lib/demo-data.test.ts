import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
