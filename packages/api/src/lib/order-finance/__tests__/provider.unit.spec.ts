import Stripe from "stripe";
import { getStripeConnectConfiguration } from "../../stripe-connect-configuration";
import { assertProviderBalances, readFinanceProvider } from "../provider";

jest.mock("stripe", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../../stripe-connect-configuration", () => ({
  getStripeConnectConfiguration: jest.fn(),
}));

function fixture() {
  const configuration = {
    apiKey: "sk_test_fixture",
    webhookSecret: "whsec_fixture",
    paymentWebhookSecret: "whsec_fixture",
    return_url: "https://vendor.example.com/return",
    refresh_url: "https://vendor.example.com/refresh",
    jobsEnabled: false,
  };
  const intent = {
    id: "pi_test",
    livemode: false,
    currency: "usd",
    amount_received: 15000,
    amount: 15000,
    amount_capturable: 0,
    status: "succeeded",
  };
  const refunds = {
    has_more: false,
    data: [{ id: "re_test", amount: 1234, status: "succeeded" }],
  };
  const retrieve = jest.fn(async () => intent);
  const list = jest.fn(async () => refunds);
  jest.mocked(getStripeConnectConfiguration).mockReturnValue(configuration);
  jest.mocked(Stripe).mockImplementation(
    () =>
      ({
        paymentIntents: { retrieve },
        refunds: { list },
      }) as unknown as Stripe,
  );
  return { configuration, intent, refunds, retrieve, list };
}

describe("finance provider verification", () => {
  beforeEach(() => jest.resetAllMocks());

  it("excludes only the exact release IDs recorded during final partial capture", async () => {
    const test = fixture();
    test.intent.amount_received = 8000;
    test.refunds.data = [
      { id: "release", amount: 7000, status: "succeeded" },
      { id: "actual", amount: 1234, status: "succeeded" },
    ];
    const provider = await readFinanceProvider("pi_test");
    expect(() =>
      assertProviderBalances(provider, 80, 12.34, ["release"]),
    ).not.toThrow();
    expect(() => assertProviderBalances(provider, 80, 12.34)).toThrow();
    expect(() =>
      assertProviderBalances(provider, 80, 70, ["actual"]),
    ).toThrow();
    expect(() =>
      assertProviderBalances(provider, 80, 12.34, ["missing"]),
    ).toThrow();
  });

  it("distinguishes a Stripe authorization-release Refund from captured-money refunds", async () => {
    const test = fixture();
    test.intent.status = "canceled";
    test.intent.amount_received = 0;
    test.refunds.data[0].amount = 15000;
    const provider = await readFinanceProvider("pi_test");
    expect(() => assertProviderBalances(provider, 0, 0)).not.toThrow();
    expect(() => assertProviderBalances(provider, 150, 150)).toThrow(
      "no coincide",
    );
    provider.refunds = [];
    expect(() => assertProviderBalances(provider, 0, 0)).not.toThrow();
  });

  it.each([
    "still authorized",
    "money captured",
    "partial release",
    "capturable remains",
  ])("does not excuse an inconsistent authorization: %s", async (mode) => {
    const test = fixture();
    test.intent.status = "canceled";
    test.intent.amount_received = 0;
    test.refunds.data[0].amount = 15000;
    if (mode === "still authorized") test.intent.status = "requires_capture";
    if (mode === "money captured") test.intent.amount_received = 100;
    if (mode === "partial release") test.refunds.data[0].amount = 100;
    if (mode === "capturable remains") test.intent.amount_capturable = 100;
    const provider = await readFinanceProvider("pi_test");
    expect(() => assertProviderBalances(provider, 0, 0)).toThrow("no coincide");
  });

  it("reads the selected payment intent and bounds refund history without issuing a money operation", async () => {
    const test = fixture();
    const result = await readFinanceProvider("pi_test");
    expect(test.retrieve).toHaveBeenCalledWith("pi_test");
    expect(test.list).toHaveBeenCalledWith({
      payment_intent: "pi_test",
      limit: 100,
    });
    expect(() => assertProviderBalances(result, 150, 12.34)).not.toThrow();
    expect(() => assertProviderBalances(result, 15000, 1234)).toThrow(
      "no coincide",
    );
  });

  it.each(["capture", "refund"])(
    "rejects divergent %s balances",
    async (kind) => {
      fixture();
      const provider = await readFinanceProvider("pi_test");
      expect(() =>
        assertProviderBalances(
          provider,
          kind === "capture" ? 149 : 150,
          kind === "refund" ? 12 : 12.34,
        ),
      ).toThrow("no coincide");
    },
  );

  it.each(["live", "currency", "truncated", "pending refund", "failed refund"])(
    "rejects unsafe provider state: %s",
    async (mode) => {
      const test = fixture();
      if (mode === "live") test.intent.livemode = true;
      if (mode === "currency") test.intent.currency = "eur";
      if (mode === "truncated") test.refunds.has_more = true;
      if (mode === "pending refund") test.refunds.data[0].status = "pending";
      if (mode === "failed refund") test.refunds.data[0].status = "failed";
      await expect(readFinanceProvider("pi_test")).rejects.toThrow(
        "conciliación",
      );
    },
  );

  it("rejects automatic payouts before constructing a provider client", async () => {
    const test = fixture();
    test.configuration.jobsEnabled = true;
    await expect(readFinanceProvider("pi_test")).rejects.toThrow(
      "liquidaciones automáticas",
    );
    expect(Stripe).not.toHaveBeenCalled();
    expect(test.retrieve).not.toHaveBeenCalled();
  });

  it("propagates read failures without making a refund call", async () => {
    const test = fixture();
    test.retrieve.mockRejectedValue(new Error("Provider unavailable"));
    await expect(readFinanceProvider("pi_test")).rejects.toThrow(
      "Provider unavailable",
    );
  });
});
