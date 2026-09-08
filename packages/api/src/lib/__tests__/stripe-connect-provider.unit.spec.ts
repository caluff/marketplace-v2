import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { SourceTextModule, SyntheticModule } from "node:vm";
import * as medusaUtils from "@medusajs/framework/utils";
import * as mercurTypes from "@mercurjs/types";
import type { IPayoutProvider } from "@mercurjs/types";
import type Stripe from "stripe";
import { getNativeStripeAccountInput, getNativeStripeOnboardingInput } from "../stripe-connect/provider-client";
import { stripeAccountStatus } from "../stripe-connect/account-reconciliation";

type AccountValidation = NonNullable<Parameters<typeof stripeAccountStatus>[1]>;

const redirects = {
  returnUrl: "https://vendor.example.test/seller/payouts",
  refreshUrl: "https://vendor.example.test/seller/payouts/refresh",
};

let patchDirectory: string;
let originalSource: string;
let patchedSource: string;

beforeAll(() => {
  const installedPath = require.resolve("@mercurjs/payout-stripe-connect");
  const patchPath = path.resolve(__dirname, "../../../../..", "patches/@mercurjs__payout-stripe-connect@2.3.3.patch");
  patchDirectory = mkdtempSync(path.join(tmpdir(), "stripe-provider-patch-"));
  const target = path.join(patchDirectory, "dist/index.js");
  mkdirSync(path.dirname(target));
  writeFileSync(target, readFileSync(installedPath));
  const apply = (args: string[]) => execFileSync("git", ["apply", ...args, patchPath], { cwd: patchDirectory, stdio: "pipe" });
  try { apply(["--check"]); } catch { apply(["--reverse"]); }
  originalSource = readFileSync(target, "utf8");
  // pnpm's patcher requires the actual source position; git may silently relocate.
  const patch = readFileSync(patchPath, "utf8");
  const header = patch.match(/^@@ -(\d+),(\d+) \+\d+,\d+ @@$/m);
  if (!header) throw new Error("Missing Stripe patch hunk header");
  const exactHunk = patch.split(/\r?\n/).slice(4).filter((line) => line.startsWith(" ") || line.startsWith("-")).map((line) => line.slice(1));
  expect(exactHunk).toHaveLength(Number(header[2]));
  expect(originalSource.split(/\r?\n/).slice(Number(header[1]) - 1, Number(header[1]) - 1 + Number(header[2])))
    .toEqual(exactHunk);
  apply([]);
  patchedSource = readFileSync(target, "utf8");
});

afterAll(() => {
  if (patchDirectory && path.dirname(path.resolve(patchDirectory)) === path.resolve(tmpdir()) && path.basename(patchDirectory).startsWith("stripe-provider-patch-")) {
    rmSync(patchDirectory, { recursive: true, force: true });
  }
});

describe("native Stripe provider input boundary", () => {
  it("leaves account metadata and idempotency to Mercur", () => {
    expect(getNativeStripeAccountInput({ data: { country: "US" }, context: {} }))
      .toEqual({ data: { country: "US" } });
  });

  it.each([
    {}, { data: { country: "CA" } }, { data: { country: "US", account_id: "other" } },
    { data: { country: "US", metadata: { account_id: "other" } } },
    { data: { country: "US" }, context: { idempotency_key: "other" } },
  ])("rejects missing country and caller account creation overrides: %j", (body) => {
    expect(() => getNativeStripeAccountInput(body)).toThrow(medusaUtils.MedusaError);
  });

  it("fills server redirects without passing an account override", () => {
    expect(getNativeStripeOnboardingInput({}, redirects)).toEqual({
      data: { return_url: redirects.returnUrl, refresh_url: redirects.refreshUrl },
    });
  });

  it.each([
    { data: { id: "acct_other" } }, { data: { account: "acct_other" } },
    { data: { return_url: "https://vendor.example.test.attacker.test/seller/payouts" } },
    { data: { return_url: "https://vendor.example.test/other" } },
    { data: { refresh_url: "https://attacker.test" } },
    { context: { idempotency_key: "other" } },
    { data: { metadata: { account_id: "other" } } },
  ])("rejects account swaps and redirect overrides: %j", (body) => {
    expect(() => getNativeStripeOnboardingInput(body, redirects)).toThrow(medusaUtils.MedusaError);
  });

  it.each(["javascript:alert(1)", "http://vendor.example.test/payouts", "https://user:pass@vendor.example.test/payouts", "https://vendor.example.test/payouts#fragment"])
    ("rejects unsafe configured redirects: %s", (returnUrl) => {
      expect(() => getNativeStripeOnboardingInput({}, { ...redirects, returnUrl })).toThrow(medusaUtils.MedusaError);
    });

  it("allows local test redirects and rejects mixed origins", () => {
    expect(getNativeStripeOnboardingInput({}, { returnUrl: "http://localhost:3000/payouts", refreshUrl: "http://localhost:3000/payouts/refresh" }).data)
      .toHaveProperty("return_url", "http://localhost:3000/payouts");
    expect(() => getNativeStripeOnboardingInput({}, { ...redirects, refreshUrl: "https://other.example.test/refresh" })).toThrow(medusaUtils.MedusaError);
  });
});

// Load the installed ESM provider with an injected, entirely offline Stripe client.
// Its real SDK verifier is retained so signature tests exercise cryptography too.
async function loadProvider(requiredCapabilities: string[] = [], patched = false, validation: AccountValidation = {}) {
  const providerPath = require.resolve("@mercurjs/payout-stripe-connect");
  const Stripe = createRequire(providerPath)("stripe") as {
    new(key: string): { webhooks: { constructEvent: (...args: unknown[]) => unknown } };
  };
  const client = {
    accounts: {
      create: jest.fn().mockResolvedValue({ id: "acct_own", country: "US" }),
      retrieve: jest.fn().mockResolvedValue(accountEvent().data.object),
    },
    accountLinks: { create: jest.fn().mockResolvedValue({ url: "https://connect.stripe.com/setup/test", expires_at: 123 }) },
    transfers: { create: jest.fn().mockResolvedValue({ id: "tr_offline" }) },
    webhooks: new Stripe("offline-placeholder").webhooks,
  };
  const module = new SourceTextModule(patched ? patchedSource : originalSource);
  await module.link(async (specifier) => {
    const exports: Record<string, unknown> = specifier === "stripe"
      ? { default: class { constructor() { return client; } } }
      : specifier === "@medusajs/framework/utils" ? medusaUtils : mercurTypes;
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    });
  });
  await module.evaluate();
  const definition = (module.namespace as unknown as {
    default: { services: Array<new(cradle: object, options: object) => IPayoutProvider> };
  }).default;
  const provider = new definition.services[0]({}, {
    apiKey: "offline-placeholder", webhookSecret: "offline-signing-fixture",
    accountValidation: { requiredCapabilities, ...validation },
  });
  return { provider, client };
}

function accountEvent(account: Record<string, unknown> = {}, event: Record<string, unknown> = {}) {
  return {
    id: "evt_offline", type: "account.updated", livemode: false, account: "acct_own",
    data: { object: {
      id: "acct_own", metadata: { account_id: "pacc_own" },
      details_submitted: true, charges_enabled: true, payouts_enabled: true,
      capabilities: { transfers: "active" }, requirements: {}, ...account,
    } }, ...event,
  };
}

function signedPayload(event: Record<string, unknown>, secret = "offline-signing-fixture") {
  const rawData = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawData}`).digest("hex");
  return { data: event, rawData, headers: { "stripe-signature": `t=${timestamp},v1=${signature}` } };
}

describe("installed Mercur Stripe Connect provider contract", () => {
  it.each([
    ["ready", {}, {}],
    ["missing details", { details_submitted: false }, {}],
    ["charges disabled", { charges_enabled: false }, {}],
    ["payouts disabled", { payouts_enabled: false }, {}],
    ["currently due", { requirements: { currently_due: ["individual.id_number"] } }, {}],
    ["past due", { requirements: { past_due: ["individual.id_number"] } }, {}],
    ["pending verification", { requirements: { pending_verification: ["individual.id_number"] } }, {}],
    ["rejected", { requirements: { disabled_reason: "rejected.fraud" } }, {}],
    ["inactive capability", { capabilities: { transfers: "inactive" } }, { requiredCapabilities: ["transfers"] }],
    ["missing capability", { capabilities: {} }, { requiredCapabilities: ["transfers"] }],
    ["active capability", {}, { requiredCapabilities: ["transfers"] }],
    ["optional details", { details_submitted: false }, { detailsSubmitted: false }],
    ["optional charges", { charges_enabled: false }, { chargesEnabled: false }],
    ["optional payouts", { payouts_enabled: false }, { payoutsEnabled: false }],
    ["optional requirements", { requirements: { currently_due: ["individual.id_number"] } }, { noOutstandingRequirements: false }],
  ] satisfies Array<[string, Record<string, unknown>, AccountValidation]>)("keeps manual-refresh status aligned with Mercur's public webhook contract: %s", async (_name, overrides, validation) => {
    const event = accountEvent(overrides);
    const expected = stripeAccountStatus(event.data.object as unknown as Stripe.Account, validation);
    const actionByStatus = {
      active: "account.activated",
      restricted: "account.restricted",
      rejected: "account.rejected",
      pending: "account.pending",
    };
    for (const patched of [false, true]) {
      const { provider, client } = await loadProvider([], patched, validation);
      client.accounts.retrieve.mockResolvedValue(event.data.object);
      expect(await provider.getWebhookActionAndData(signedPayload(event)))
        .toEqual({ action: actionByStatus[expected], data: { id: "pacc_own" } });
    }
  });

  it("creates native Express accounts with Mercur metadata and idempotency", async () => {
    const { provider, client } = await loadProvider();
    await provider.createPayoutAccount({ data: { country: "US", account_id: "pacc_own" }, context: { idempotency_key: "pacc_own" } });
    expect(client.accounts.create).toHaveBeenCalledWith({ type: "express", country: "US", metadata: { account_id: "pacc_own" } }, { idempotencyKey: "pacc_own" });
    await expect(provider.createPayoutAccount({})).rejects.toThrow('"country" is required');
  });

  it("uses data URLs for hosted onboarding and returns the native link", async () => {
    const { provider, client } = await loadProvider();
    const input = getNativeStripeOnboardingInput({}, redirects);
    const result = await provider.createOnboarding({ data: { id: "acct_own", ...input.data } });
    expect(client.accountLinks.create).toHaveBeenCalledWith({ account: "acct_own", ...input.data, type: "account_onboarding" });
    expect(result.data).toHaveProperty("url", "https://connect.stripe.com/setup/test");
    expect(result.data).not.toHaveProperty("client_secret");
  });

  it.each([
    [{}, "account.activated"],
    [{ capabilities: {} }, "account.restricted"],
    [{ capabilities: { transfers: "pending" } }, "account.restricted"],
    [{ capabilities: { transfers: "inactive" } }, "account.restricted"],
    [{ requirements: { currently_due: ["individual.verification.document"] } }, "account.restricted"],
    [{ requirements: { pending_verification: ["individual.verification.document"] } }, "account.restricted"],
    [{ requirements: { disabled_reason: "rejected.fraud" } }, "account.rejected"],
  ])("evaluates native validation settings: %j", async (account, action) => {
    const { provider } = await loadProvider(["transfers"]);
    expect(await provider.getWebhookActionAndData(signedPayload(accountEvent(account))))
      .toEqual({ action, data: { id: "pacc_own" } });
  });

  it("rejects missing, tampered and incorrectly signed payloads", async () => {
    const { provider } = await loadProvider();
    const payload = signedPayload(accountEvent());
    await expect(provider.getWebhookActionAndData({ ...payload, headers: {} })).rejects.toThrow();
    await expect(provider.getWebhookActionAndData({ ...payload, rawData: `${payload.rawData} ` })).rejects.toThrow();
    await expect(provider.getWebhookActionAndData(signedPayload(accountEvent(), "wrong-fixture"))).rejects.toThrow();
  });

  it("characterizes missing native test-mode and account-ID binding checks", async () => {
    const { provider } = await loadProvider();
    const event = accountEvent({ id: "acct_different", metadata: { account_id: "pacc_other" } }, { livemode: true });
    expect(await provider.getWebhookActionAndData(signedPayload(event)))
      .toEqual({ action: "account.activated", data: { id: "pacc_other" } });
  });

  it("characterizes stale duplicate activation: native provider does not hydrate current status", async () => {
    const { provider } = await loadProvider();
    const stale = signedPayload(accountEvent());
    const restricted = signedPayload(accountEvent({ payouts_enabled: false }, { id: "evt_newer" }));
    expect((await provider.getWebhookActionAndData(restricted)).action).toBe("account.restricted");
    expect((await provider.getWebhookActionAndData(stale)).action).toBe("account.activated");
    expect((await provider.getWebhookActionAndData(stale)).action).toBe("account.activated");
  });

  it("characterizes USD transfer conversion without moving any money", async () => {
    const { provider, client } = await loadProvider();
    const result = await provider.createPayout({ account_id: "pacc_own", amount: 49.99, currency_code: "usd", data: { id: "acct_own", seller_id: "seller_own", order_id: "order_own" }, context: { idempotency_key: "order_own" } });
    expect(client.transfers.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 4999, currency: "usd", destination: "acct_own", transfer_group: "order_own" }), { idempotencyKey: "order_own" });
    expect(result.status).toBe(mercurTypes.PayoutStatus.PAID);
  });
});

describe("maintained native Stripe webhook security patch", () => {
  it("uses latest status for delayed and duplicate signed activation events", async () => {
    const { provider, client } = await loadProvider(["transfers"], true);
    client.accounts.retrieve.mockResolvedValue(accountEvent({ capabilities: { transfers: "inactive" } }).data.object);
    const stale = signedPayload(accountEvent());
    expect((await provider.getWebhookActionAndData(stale)).action).toBe("account.restricted");
    expect((await provider.getWebhookActionAndData(stale)).action).toBe("account.restricted");
    expect(client.accounts.retrieve).toHaveBeenCalledTimes(2);
    expect(client.accounts.retrieve).toHaveBeenCalledWith("acct_own");
  });

  it.each([
    [{}, "account.activated"],
    [{ capabilities: {} }, "account.restricted"],
    [{ requirements: { disabled_reason: "rejected.fraud" } }, "account.rejected"],
  ])("retains native readiness mapping for latest account: %j", async (latest, action) => {
    const { provider, client } = await loadProvider(["transfers"], true);
    client.accounts.retrieve.mockResolvedValue(accountEvent(latest).data.object);
    expect((await provider.getWebhookActionAndData(signedPayload(accountEvent()))).action).toBe(action);
  });

  it.each([{ livemode: true }, { livemode: undefined }, { account: "acct_other" }])("rejects mode/account mismatches before remote lookup: %j", async (overrides) => {
    const { provider, client } = await loadProvider([], true);
    await expect(provider.getWebhookActionAndData(signedPayload(accountEvent({}, overrides)))).rejects.toThrow("Invalid Stripe test account event");
    expect(client.accounts.retrieve).not.toHaveBeenCalled();
  });

  it.each([{ metadata: {} }, { id: "other" }])("rejects missing signed identity before remote lookup: %j", async (snapshot) => {
    const { provider, client } = await loadProvider([], true);
    await expect(provider.getWebhookActionAndData(signedPayload(accountEvent(snapshot)))).rejects.toThrow();
    expect(client.accounts.retrieve).not.toHaveBeenCalled();
  });

  it.each([{ id: "acct_other" }, { metadata: { account_id: "pacc_other" } }, { deleted: true }])("rejects fetched account identity changes: %j", async (latest) => {
    const { provider, client } = await loadProvider([], true);
    client.accounts.retrieve.mockResolvedValue(accountEvent(latest).data.object);
    await expect(provider.getWebhookActionAndData(signedPayload(accountEvent()))).rejects.toThrow("identity mismatch");
  });

  it("rejects incorrect signatures without remote reads", async () => {
    const { provider, client } = await loadProvider([], true);
    await expect(provider.getWebhookActionAndData(signedPayload(accountEvent(), "wrong-fixture"))).rejects.toThrow();
    expect(client.accounts.retrieve).not.toHaveBeenCalled();
  });

  it("fails closed when latest account cannot be retrieved", async () => {
    const { provider, client } = await loadProvider([], true);
    client.accounts.retrieve.mockRejectedValue(new Error("offline remote failure"));
    await expect(provider.getWebhookActionAndData(signedPayload(accountEvent()))).rejects.toThrow("offline remote failure");
  });

  it("does not retrieve accounts for unsupported event types", async () => {
    const { provider, client } = await loadProvider([], true);
    expect(await provider.getWebhookActionAndData(signedPayload(accountEvent({}, { type: "transfer.created" })))).toEqual({ action: "not_supported" });
    expect(client.accounts.retrieve).not.toHaveBeenCalled();
  });
});
