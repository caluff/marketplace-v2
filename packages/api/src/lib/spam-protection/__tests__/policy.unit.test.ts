import { spamProtectionBuckets } from "../policy";

const request = (path: string, extra: object = {}) =>
  spamProtectionBuckets({
    method: "POST",
    path,
    ip: "198.51.100.7",
    ...extra,
  });

describe("spam protection policy", () => {
  it("normalizes route casing and encoded parameters like Express", () => {
    const body = { email: "person@example.test" };
    expect(request("/AUTH/%63ustomer/%65mailpass/", { body })).toEqual(
      request("/auth/customer/emailpass", { body }),
    );
    expect(request("/auth/customer/%invalid", { body })).toEqual([]);
  });
  it("leaves browsing, health, checkout and provider webhooks outside its scope", () => {
    for (const path of [
      "/health",
      "/store/products",
      "/hooks/payout",
      "/hooks/payment/stripe",
      "/store/carts",
      "/store/carts/cart_test/complete",
      "/admin/orders/order_test",
    ]) {
      expect(request(path)).toEqual([]);
    }
    expect(
      spamProtectionBuckets({
        method: "GET",
        path: "/auth/customer/emailpass",
      }),
    ).toEqual([]);
    expect(
      spamProtectionBuckets({
        method: "OPTIONS",
        path: "/auth/customer/emailpass",
      }),
    ).toEqual([]);
  });

  it.each(["customer", "user", "member"])(
    "protects native %s login, registration and recovery",
    (actor) => {
      const body = { email: " Customer@Example.Test " };
      expect(request(`/auth/${actor}/emailpass`, { body })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scope: "login-address-network",
            subject: JSON.stringify(["198.51.100.7", "customer@example.test"]),
            limit: 12,
          }),
        ]),
      );
      expect(request(`/auth/${actor}/emailpass/register`, { body })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scope: "registration-address",
            subject: "customer@example.test",
            limit: 3,
          }),
        ]),
      );
      expect(
        request(`/auth/${actor}/emailpass/reset-password`, {
          body: { identifier: body.email },
        }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scope: "email-address-cooldown",
            subject: "customer@example.test",
            limit: 1,
            windowSeconds: 60,
          }),
        ]),
      );
    },
  );

  it("shares mail budgets across password reset and native verification", () => {
    const reset = request("/auth/customer/emailpass/reset-password", {
      body: { identifier: "mail@example.test" },
    });
    const verify = request("/auth/verification/request", {
      body: { entity_id: " MAIL@example.test " },
    });
    expect(reset.filter((bucket) => bucket.scope.startsWith("email-"))).toEqual(
      verify.filter((bucket) => bucket.scope.startsWith("email-")),
    );
  });

  it("cannot redirect a recipient budget by adding unrelated identity fields", () => {
    const body = {
      email: "login@example.test",
      identifier: "reset@example.test",
      entity_id: "verify@example.test",
    };
    expect(request("/auth/customer/emailpass/register", { body })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "registration-address",
          subject: body.email,
        }),
      ]),
    );
    expect(
      request("/auth/customer/emailpass/reset-password", { body }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "email-address-hour",
          subject: body.identifier,
        }),
      ]),
    );
    expect(request("/auth/verification/request", { body })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "email-address-hour",
          subject: body.entity_id,
        }),
      ]),
    );
  });

  it("shares authenticated verification budgets across every entry point", () => {
    const paths = [
      "/auth/verification/request",
      "/auth/account/email-verification/request",
      "/store/vendor-application/verification",
    ];
    const budgets = paths.map((path) =>
      request(path, { authIdentityId: "auth_same" }).filter((bucket) =>
        bucket.scope.startsWith("verification-identity"),
      ),
    );
    expect(budgets[0]).toHaveLength(2);
    expect(budgets[1]).toEqual(budgets[0]);
    expect(budgets[2]).toEqual(budgets[0]);
  });

  it("does not let malformed or missing email fields disable the network budget", () => {
    for (const body of [
      undefined,
      null,
      [],
      { email: {} },
      { email: "x".repeat(400) + "@test" },
      { email: "invalid" },
    ]) {
      expect(request("/auth/customer/emailpass/register/", { body })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scope: "registration-network",
            subject: "198.51.100.7",
          }),
        ]),
      );
    }
  });

  it("does not globally lock a login address when a different network exhausts its attempts", () => {
    const first = request("/auth/customer/emailpass", {
      body: { email: "same@example.test" },
    }).find((bucket) => bucket.scope === "login-address-network");
    const second = request("/auth/customer/emailpass", {
      body: { email: "same@example.test" },
      ip: "198.51.100.8",
    }).find((bucket) => bucket.scope === "login-address-network");
    expect(first?.subject).not.toEqual(second?.subject);
  });

  it("bounds one-time-code attempts, tracking, customer creation and application submissions", () => {
    for (const path of [
      "/auth/mfa/challenges/mfa_test/verify",
      "/auth/verification/confirm",
      "/auth/account/email-verification/confirm",
    ]) {
      expect(request(path, { authIdentityId: "auth_test" })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            scope: "verification-attempts",
            subject: "auth_test",
            limit: 20,
          }),
        ]),
      );
    }
    expect(request("/store/order-tracking")).toEqual([
      expect.objectContaining({ scope: "order-tracking-network" }),
    ]);
    expect(
      request("/store/order-tracking/claim", { authIdentityId: "auth_test" }),
    ).toHaveLength(2);
    expect(
      request("/store/customers", { authIdentityId: "auth_test" }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "customer-creation-identity" }),
      ]),
    );
    expect(
      request("/store/vendor-application/submit", {
        authIdentityId: "auth_test",
      }),
    ).toEqual([
      expect.objectContaining({ scope: "application-submit", limit: 5 }),
    ]);
  });
});
