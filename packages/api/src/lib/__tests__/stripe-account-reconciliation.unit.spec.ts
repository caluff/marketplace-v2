import Stripe from "stripe";
import { createRequire } from "node:module";
import type { MedusaContainer } from "@medusajs/framework/types";
import { PayoutAccountStatus } from "@mercurjs/types";
import { getStripeConnectConfiguration } from "../stripe-connect-configuration";
import {
  assertStripeAccountBinding,
  reconcileStripeAccount,
  stripeAccountStatus,
} from "../stripe-connect/account-reconciliation";
import { VendorStripeAccountRefresh } from "../../api/vendor/stripe-account-refresh/validators";

jest.mock("stripe", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../stripe-connect-configuration", () => ({
  getStripeConnectConfiguration: jest.fn(),
}));

const vendor = {
  member_id: "member_own",
  auth_identity_id: "auth_own",
  seller_id: "seller_own",
};
const input = { payout_account_id: "pacc_own", vendor };
function account(overrides: Partial<Stripe.Account> = {}): Stripe.Account {
  return {
    id: "acct_own",
    type: "express",
    country: "US",
    metadata: { account_id: "pacc_own" },
    details_submitted: true,
    charges_enabled: true,
    payouts_enabled: true,
    requirements: {
      currently_due: [],
      past_due: [],
      pending_verification: [],
      disabled_reason: null,
    },
    ...overrides,
  } as Stripe.Account;
}

function fixture() {
  const local = {
    id: "pacc_own",
    data: { id: "acct_own" },
    status: PayoutAccountStatus.PENDING,
  };
  const links = [{ seller_id: "seller_own", payout_account_id: "pacc_own" }];
  const graph = jest.fn(
    async ({ filters }: { filters: Record<string, string> }) => ({
      data: links.filter((link) =>
        Object.entries(filters).every(
          ([key, value]) => link[key as keyof typeof link] === value,
        ),
      ),
    }),
  );
  const retrieveAuthIdentity = jest
    .fn()
    .mockResolvedValue({ app_metadata: { member_id: "member_own" } });
  const retrieveMember = jest
    .fn()
    .mockResolvedValue({ id: "member_own", is_active: true });
  const listSellerMembers = jest
    .fn()
    .mockResolvedValue([{ role_id: "role_finance" }]);
  const retrieveSeller = jest
    .fn()
    .mockResolvedValue({ id: "seller_own", status: "open" });
  const listPoliciesForRole = jest
    .fn()
    .mockResolvedValue([{ resource: "payout_account", operation: "update" }]);
  const retrievePayoutAccount = jest.fn(async () => ({
    ...local,
    data: { ...local.data },
  }));
  const updatePayoutAccounts = jest.fn(
    async ({ status }: { status: PayoutAccountStatus }) => {
      local.status = status;
    },
  );
  const retrieve = jest.fn().mockResolvedValue(account());
  jest
    .mocked(Stripe)
    .mockImplementation(
      () => ({ accounts: { retrieve } }) as unknown as Stripe,
    );
  let lockOwner: string | undefined;
  const acquire = jest.fn(
    async (_key: string, args: { ownerId: string; expire?: number }) => {
      if (lockOwner) throw new Error("Lock conflict");
      lockOwner = args.ownerId;
    },
  );
  const releaseLock = jest.fn(
    async (_key: string, args: { ownerId: string }) => {
      if (lockOwner !== args.ownerId) return false;
      lockOwner = undefined;
      return true;
    },
  );
  const services: Record<string, unknown> = {
    auth: { retrieveAuthIdentity },
    seller: { retrieveMember, listSellerMembers, retrieveSeller },
    rbac: { listPoliciesForRole },
    query: { graph },
    locking: { acquire, release: releaseLock },
    payout: { retrievePayoutAccount, updatePayoutAccounts },
  };
  const container = {
    resolve: (key: string) => services[key],
  } as unknown as MedusaContainer;
  return {
    container,
    local,
    links,
    graph,
    retrieveAuthIdentity,
    retrieveMember,
    listSellerMembers,
    retrieveSeller,
    listPoliciesForRole,
    retrievePayoutAccount,
    updatePayoutAccounts,
    retrieve,
    acquire,
    releaseLock,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(getStripeConnectConfiguration)
    .mockReturnValue({ apiKey: "sk_test_fixture" } as ReturnType<
      typeof getStripeConnectConfiguration
    >);
});

it("webhook reconciliation performs exactly one fresh Stripe read under the account lock", async () => {
  const f = fixture();
  await reconcileStripeAccount(f.container, { payout_account_id: "pacc_own" });
  expect(f.retrieve).toHaveBeenCalledTimes(1);
  expect(f.acquire.mock.invocationCallOrder[0]).toBeLessThan(f.retrieve.mock.invocationCallOrder[0]);
  expect(f.retrieve.mock.invocationCallOrder[0]).toBeLessThan(f.updatePayoutAccounts.mock.invocationCallOrder[0]);
  expect(f.releaseLock).toHaveBeenCalledTimes(1);
});

describe("Stripe native status mapping and binding", () => {
  it("maps active, incomplete, pending verification and rejected accounts", () => {
    expect(stripeAccountStatus(account())).toBe("active");
    expect(stripeAccountStatus(account({ details_submitted: false }))).toBe(
      "restricted",
    );
    expect(
      stripeAccountStatus(
        account({
          requirements: {
            ...account().requirements!,
            pending_verification: ["individual.id_number"],
          },
        }),
      ),
    ).toBe("restricted");
    expect(
      stripeAccountStatus(
        account({
          requirements: {
            ...account().requirements!,
            disabled_reason: "rejected.fraud",
          },
        }),
      ),
    ).toBe("rejected");
    expect(
      stripeAccountStatus(account(), { requiredCapabilities: ["transfers"] }),
    ).toBe("restricted");
    expect(
      stripeAccountStatus(account({ details_submitted: false }), {
        detailsSubmitted: false,
      }),
    ).toBe("active");
  });
  it.each([
    { id: "acct_other" },
    { country: "CA" },
    { type: "standard" },
    { metadata: {} },
    { metadata: { account_id: "pacc_other" } },
    { deleted: true },
    { livemode: true },
  ])("rejects mismatched account binding %j", (override) => {
    expect(() =>
      assertStripeAccountBinding(account(override as Partial<Stripe.Account>), {
        id: "pacc_own",
        data: { id: "acct_own" },
      }),
    ).toThrow("not available");
  });
  it("rejects client-owned IDs, status and redirect inputs", () => {
    expect(VendorStripeAccountRefresh.safeParse({}).success).toBe(true);
    for (const body of [
      { payout_account_id: "pacc_other" },
      { seller_id: "seller_other" },
      { status: "active" },
      { return_url: "https://evil.invalid" },
    ])
      expect(VendorStripeAccountRefresh.safeParse(body).success).toBe(false);
  });
});

describe("fresh Stripe reconciliation", () => {
  it("the installed Redis provider passes zero TTL when expiry is omitted", async () => {
    const nativeRequire = createRequire(
      require.resolve("@medusajs/medusa/locking-redis"),
    );
    const acquireLock = jest.fn().mockResolvedValue(1);
    const releaseLock = jest.fn().mockResolvedValue(1);
    const redisClient = { defineCommand: jest.fn(), acquireLock, releaseLock };
    const provider = nativeRequire("@medusajs/locking-redis") as {
      default: {
        services: [
          new (
            input: { redisClient: typeof redisClient },
            options: object,
          ) => {
            acquire: (key: string, args: { ownerId: string }) => Promise<void>;
            release: (
              key: string,
              args: { ownerId: string },
            ) => Promise<boolean>;
          },
        ];
      };
    };
    const locking = new provider.default.services[0]({ redisClient }, {});
    await locking.acquire("payout-account-status/pacc_own", {
      ownerId: "unique-owner",
    });
    expect(acquireLock).toHaveBeenCalledWith(
      "medusa_lock:payout-account-status/pacc_own",
      "unique-owner",
      0,
      false,
    );
    await locking.release("payout-account-status/pacc_own", {
      ownerId: "unique-owner",
    });
    expect(releaseLock).toHaveBeenCalledWith(
      "medusa_lock:payout-account-status/pacc_own",
      "unique-owner",
    );
  });
  it("persists only native status and skips duplicate writes", async () => {
    const f = fixture();
    await expect(reconcileStripeAccount(f.container, input)).resolves.toEqual({
      id: "pacc_own",
      status: "active",
    });
    await reconcileStripeAccount(f.container, input);
    expect(f.updatePayoutAccounts).toHaveBeenCalledTimes(1);
    expect(f.updatePayoutAccounts).toHaveBeenCalledWith({
      id: "pacc_own",
      status: "active",
    });
    expect(f.retrieve).toHaveBeenCalledWith("acct_own");
    expect(f.listPoliciesForRole).toHaveBeenCalledWith("role_finance");
    expect(Stripe).toHaveBeenCalledWith("sk_test_fixture", {
      timeout: 10000,
      maxNetworkRetries: 0,
    });
  });
  it.each([null, { apiKey: "sk_live_fixture" }])(
    "fails closed for unavailable/test mode configuration %j",
    async (config) => {
      const f = fixture();
      jest
        .mocked(getStripeConnectConfiguration)
        .mockReturnValue(
          config as ReturnType<typeof getStripeConnectConfiguration>,
        );
      await expect(reconcileStripeAccount(f.container, input)).rejects.toThrow(
        "not available",
      );
      expect(f.retrieve).not.toHaveBeenCalled();
    },
  );
  it.each(["identity", "inactive", "closed", "membership", "role"])(
    "rejects %s before Stripe access",
    async (failure) => {
      const f = fixture();
      if (failure === "identity")
        f.retrieveAuthIdentity.mockResolvedValue({
          app_metadata: { member_id: "member_other" },
        });
      if (failure === "inactive")
        f.retrieveMember.mockResolvedValue({ is_active: false });
      if (failure === "closed")
        f.retrieveSeller.mockResolvedValue({ status: "closed" });
      if (failure === "membership") f.listSellerMembers.mockResolvedValue([]);
      if (failure === "role")
        f.listPoliciesForRole.mockResolvedValue([
          { resource: "payout_account", operation: "read" },
        ]);
      await expect(
        reconcileStripeAccount(f.container, input),
      ).rejects.toThrow();
      expect(f.retrieve).not.toHaveBeenCalled();
      expect(f.updatePayoutAccounts).not.toHaveBeenCalled();
    },
  );
  it.each(["missing", "shared", "multiple"])(
    "rejects %s links even for verified webhooks",
    async (kind) => {
      const f = fixture();
      if (kind === "missing") f.links.splice(0);
      if (kind === "shared")
        f.links.push({
          seller_id: "seller_other",
          payout_account_id: "pacc_own",
        });
      if (kind === "multiple")
        f.links.push({
          seller_id: "seller_own",
          payout_account_id: "pacc_other",
        });
      await expect(
        reconcileStripeAccount(f.container, { payout_account_id: "pacc_own" }),
      ).rejects.toThrow("not available");
      expect(f.retrieve).not.toHaveBeenCalled();
    },
  );
  it.each(["role", "link", "remote-id"])(
    "rechecks changed %s after remote lookup",
    async (kind) => {
      const f = fixture();
      f.retrieve.mockImplementation(async () => {
        if (kind === "role") f.listPoliciesForRole.mockResolvedValue([]);
        if (kind === "link") f.links[0].seller_id = "seller_other";
        if (kind === "remote-id") f.local.data.id = "acct_other";
        return account();
      });
      await expect(
        reconcileStripeAccount(f.container, input),
      ).rejects.toThrow();
      expect(f.updatePayoutAccounts).not.toHaveBeenCalled();
    },
  );
  it("preserves prior status on remote failure without retrying or leaking details", async () => {
    const f = fixture();
    f.retrieve.mockRejectedValue(new Error("secret provider details"));
    await expect(reconcileStripeAccount(f.container, input)).rejects.toThrow(
      "Try again manually",
    );
    expect(f.retrieve).toHaveBeenCalledTimes(1);
    expect(f.updatePayoutAccounts).not.toHaveBeenCalled();
    expect(f.local.status).toBe("pending");
    expect(f.releaseLock).toHaveBeenCalledTimes(1);
  });
  it("rejects overlap without fetching or releasing another owner's lock; retries fetch fresh", async () => {
    const f = fixture();
    let release!: (value: Stripe.Account) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.retrieve.mockImplementationOnce(() => {
      started();
      return new Promise<Stripe.Account>((resolve) => {
        release = resolve;
      });
    });
    f.retrieve.mockResolvedValueOnce(account({ payouts_enabled: false }));
    const manual = reconcileStripeAccount(f.container, input);
    await ready;
    const webhook = reconcileStripeAccount(f.container, {
      payout_account_id: "pacc_own",
    });
    await expect(webhook).rejects.toThrow("Lock conflict");
    expect(f.retrieve).toHaveBeenCalledTimes(1);
    expect(f.releaseLock).not.toHaveBeenCalled();
    release(account());
    await manual;
    await reconcileStripeAccount(f.container, {
      payout_account_id: "pacc_own",
    });
    expect(f.acquire.mock.calls.map((call) => call[0])).toEqual([
      "payout-account-status/pacc_own",
      "payout-account-status/pacc_own",
      "payout-account-status/pacc_own",
    ]);
    expect(
      new Set(f.acquire.mock.calls.map((call) => call[1].ownerId)).size,
    ).toBe(3);
    expect(
      f.acquire.mock.calls.every((call) => call[1].expire === undefined),
    ).toBe(true);
    expect(f.releaseLock.mock.calls[0][1].ownerId).toBe(
      f.acquire.mock.calls[0][1].ownerId,
    );
    expect(f.local.status).toBe("restricted");
    expect(
      f.updatePayoutAccounts.mock.calls.map((call) => call[0].status),
    ).toEqual(["active", "restricted"]);
  });
});
