import { getStripeConnectConfiguration } from "../stripe-connect-configuration";

const environment = {
  STRIPE_API_KEY: "sk_test_fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_paymentfixture",
  STRIPE_PAYOUT_WEBHOOK_SECRET: "whsec_payoutfixture",
  VENDOR_PUBLIC_URL: "https://vendor.example.test",
};

describe("native Stripe Connect configuration", () => {
  it("does not activate incomplete configuration or jobs by default", () => {
    expect(getStripeConnectConfiguration({})).toBeNull();
    expect(
      getStripeConnectConfiguration({
        STRIPE_API_KEY: environment.STRIPE_API_KEY,
      }),
    ).toBeNull();
    expect(getStripeConnectConfiguration(environment)?.jobsEnabled).toBe(false);
  });
  it("uses separate webhook secrets and server-owned return links", () => {
    expect(getStripeConnectConfiguration(environment)).toMatchObject({
      return_url:
        "https://vendor.example.test/seller/settings/payments?returned=1",
      refresh_url:
        "https://vendor.example.test/seller/settings/payments?refresh=1",
      webhookSecret: environment.STRIPE_PAYOUT_WEBHOOK_SECRET,
      paymentWebhookSecret: environment.STRIPE_WEBHOOK_SECRET,
    });
  });
  it("rejects live keys without exposing them", () => {
    expect(() =>
      getStripeConnectConfiguration({
        ...environment,
        STRIPE_API_KEY: "sk_live_fixture",
      }),
    ).toThrow("test-mode keys only");
  });
  it.each([
    "http://vendor.example.test",
    "https://user:pass@vendor.example.test",
    "https://vendor.example.test/other",
    "https://vendor.example.test?redirect=evil",
  ])("rejects unsafe origin %s", (VENDOR_PUBLIC_URL) => {
    expect(() =>
      getStripeConnectConfiguration({ ...environment, VENDOR_PUBLIC_URL }),
    ).toThrow("[stripe]");
  });
  it("allows local HTTP only during development", () => {
    expect(
      getStripeConnectConfiguration({
        ...environment,
        VENDOR_PUBLIC_URL: "http://localhost:7001",
      })?.return_url,
    ).toContain("http://localhost:7001/");
    expect(() =>
      getStripeConnectConfiguration({
        ...environment,
        NODE_ENV: "production",
        VENDOR_PUBLIC_URL: "http://localhost:7001",
      }),
    ).toThrow("[stripe]");
  });
});
