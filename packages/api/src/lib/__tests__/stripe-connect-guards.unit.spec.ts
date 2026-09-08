import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import Stripe from "stripe";
import { getStripeConnectConfiguration } from "../stripe-connect-configuration";
import { guardNativeStripeConnect, nativeStripePayoutWebhookGuard } from "../stripe-connect/native-guards";
import { validateSellerPayoutAccount } from "@mercurjs/core/api/vendor/payout-accounts/helpers";

jest.mock("../stripe-connect-configuration", () => ({ getStripeConnectConfiguration: jest.fn() }));
jest.mock("@mercurjs/core/api/vendor/payout-accounts/helpers", () => ({ validateSellerPayoutAccount: jest.fn() }));

const configuration = { apiKey: "sk_test_fixture", webhookSecret: "whsec_fixture", return_url: "https://vendor.example.test/seller/settings/payments?returned=1", refresh_url: "https://vendor.example.test/seller/settings/payments?refresh=1" };
const stripe = new Stripe(configuration.apiKey);

function signedPayload(req: MedusaRequest, payload = event(), timestamp?: number) {
  req.rawBody = Buffer.from(JSON.stringify(payload));
  req.headers["stripe-signature"] = stripe.webhooks.generateTestHeaderString({
    payload: req.rawBody.toString(), secret: configuration.webhookSecret, timestamp,
  });
}

function request(body: unknown = {}) {
  const graph = jest.fn().mockResolvedValue({ data: [{ id: "pacc_own", data: { id: "acct_own" } }] });
  const getWebhookActionAndData = jest.fn().mockResolvedValue({ action: "account.activated", data: { id: "pacc_own" } });
  const resolve = jest.fn().mockImplementation((key: string) => key === "query" ? { graph } : { getWebhookActionAndData });
  const req = { originalUrl: "/vendor/payout-accounts", method: "POST", body, headers: { "stripe-signature": "fixture-signature" }, scope: { resolve } } as unknown as MedusaRequest;
  return { req, graph, getWebhookActionAndData, resolve };
}

function event(overrides: Record<string, unknown> = {}) {
  return { id: "evt_own", type: "account.updated", livemode: false, account: "acct_own", data: { object: { id: "acct_own", metadata: { account_id: "pacc_own" } } }, ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getStripeConnectConfiguration).mockReturnValue(configuration as ReturnType<typeof getStripeConnectConfiguration>);
  jest.mocked(validateSellerPayoutAccount).mockResolvedValue(undefined);
});

describe("native payout route guard", () => {
  it.each(["GET", "POST"])("blocks unconfigured %s account routes before native system provider fallback", async (method) => {
    jest.mocked(getStripeConnectConfiguration).mockReturnValue(null);
    const { req } = request({ data: { country: "US" } });
    req.method = method;
    await expect(guardNativeStripeConnect(req, "seller_own")).rejects.toThrow("not configured");
  });

  it("keeps unrelated routes independent of Stripe configuration", async () => {
    jest.mocked(getStripeConnectConfiguration).mockReturnValue(null);
    const { req } = request();
    req.originalUrl = "/vendor/products";
    await expect(guardNativeStripeConnect(req, "seller_own")).resolves.toBeUndefined();
  });

  it("replaces validated body with trusted native input", async () => {
    const { req } = request({ data: { country: "US" }, context: {} });
    await guardNativeStripeConnect(req, "seller_own");
    expect(req.body).toEqual({ data: { country: "US" } });
    expect(req.validatedBody).toEqual(req.body);
  });

  it("uses native ownership validation and server-owned redirects", async () => {
    const { req } = request();
    req.originalUrl = "/vendor/payout-accounts/pacc_own/onboarding";
    await guardNativeStripeConnect(req, "seller_own");
    expect(validateSellerPayoutAccount).toHaveBeenCalledWith(req.scope, "seller_own", "pacc_own");
    expect(req.body).toEqual({ data: { return_url: configuration.return_url, refresh_url: configuration.refresh_url } });
  });

  it("does not mask native ownership failure", async () => {
    jest.mocked(validateSellerPayoutAccount).mockRejectedValueOnce(new Error("not found"));
    const { req } = request();
    req.originalUrl = "/vendor/payout-accounts/pacc_other/onboarding";
    await expect(guardNativeStripeConnect(req, "seller_own")).rejects.toThrow("not found");
  });
});

describe("native payout webhook prequeue guard", () => {
  const res = { sendStatus: jest.fn() } as unknown as MedusaResponse;

  it("checks signature before the database and queues only the verified body", async () => {
    const { req, getWebhookActionAndData, graph } = request({ untrusted: true });
    signedPayload(req);
    const next = jest.fn();
    await nativeStripePayoutWebhookGuard(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual(event());
    expect(graph).toHaveBeenCalledTimes(1);
    expect(getWebhookActionAndData).not.toHaveBeenCalled();
  });

  it("rejects signature failures without database access or leaking provider errors", async () => {
    const { req, graph } = request();
    signedPayload(req);
    req.headers["stripe-signature"] = "fixture-invalid-signature";
    const next = jest.fn();
    await nativeStripePayoutWebhookGuard(req, res, next);
    expect(next.mock.calls[0][0].message).toBe("Stripe webhook verification failed.");
    expect(graph).not.toHaveBeenCalled();
  });

  it.each([undefined, Buffer.from(""), Buffer.alloc(256 * 1024 + 1)])("rejects missing or oversized raw bodies", async (rawBody) => {
    const { req, resolve } = request();
    req.rawBody = rawBody;
    const next = jest.fn();
    await nativeStripePayoutWebhookGuard(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([{ livemode: true }, { livemode: undefined }, { account: "acct_other" }])("rejects signed event mode/account mismatches: %j", async (overrides) => {
    const { req, graph } = request();
    signedPayload(req, event(overrides));
    const next = jest.fn();
    await nativeStripePayoutWebhookGuard(req, res, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(graph).not.toHaveBeenCalled();
  });

  it.each([{ data: [] }, { data: [{ id: "pacc_own", data: { id: "acct_other" } }] }])("rejects absent local account and remote ID mismatch: %j", async ({ data }) => {
    const { req, graph } = request();
    signedPayload(req);
    graph.mockResolvedValue({ data });
    const next = jest.fn();
    await nativeStripePayoutWebhookGuard(req, res, next);
    expect(next.mock.calls[0][0].message).toContain("identity mismatch");
  });

  it("acknowledges verified unsupported events without queueing", async () => {
    const { req, graph, getWebhookActionAndData } = request();
    signedPayload(req, event({ type: "transfer.created" }));
    const next = jest.fn();
    await nativeStripePayoutWebhookGuard(req, res, next);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
    expect(graph).not.toHaveBeenCalled();
    expect(getWebhookActionAndData).not.toHaveBeenCalled();
  });

  it("rejects tampered bytes and expired signatures before any database or queue work", async () => {
    for (const tamper of [true, false]) {
      const { req, graph, getWebhookActionAndData } = request();
      signedPayload(req, event(), tamper ? undefined : Math.floor(Date.now() / 1000) - 600);
      if (tamper) req.rawBody = Buffer.from(JSON.stringify(event({ account: "acct_tampered" })));
      const next = jest.fn();
      await nativeStripePayoutWebhookGuard(req, res, next);
      expect(next.mock.calls[0][0].message).toBe("Stripe webhook verification failed.");
      expect(graph).not.toHaveBeenCalled();
      expect(getWebhookActionAndData).not.toHaveBeenCalled();
    }
  });

  it("never acknowledges an unsupported event with an invalid signature", async () => {
    const { req, graph } = request();
    signedPayload(req, event({ type: "transfer.created" }));
    req.headers["stripe-signature"] = "invalid";
    const next = jest.fn();
    await nativeStripePayoutWebhookGuard(req, res, next);
    expect(next.mock.calls[0][0].message).toBe("Stripe webhook verification failed.");
    expect(res.sendStatus).not.toHaveBeenCalled();
    expect(graph).not.toHaveBeenCalled();
  });
});
