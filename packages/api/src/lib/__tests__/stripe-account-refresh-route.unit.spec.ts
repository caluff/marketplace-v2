import type { MedusaResponse } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import { POST } from "../../api/vendor/stripe-account-refresh/route";
import { refreshVendorStripeAccountWorkflow } from "../../workflows/refresh-vendor-stripe-account";

jest.mock("../../workflows/refresh-vendor-stripe-account", () => ({
  refreshVendorStripeAccountWorkflow: jest.fn(),
}));

function fixture() {
  const run = jest
    .fn()
    .mockResolvedValue({ result: { id: "pacc_own", status: "active" } });
  jest
    .mocked(refreshVendorStripeAccountWorkflow)
    .mockReturnValue({ run } as unknown as ReturnType<
      typeof refreshVendorStripeAccountWorkflow
    >);
  const req = {
    scope: {},
    auth_context: { actor_id: "member_own", auth_identity_id: "auth_own" },
    seller_context: { seller_id: "seller_own" },
    validatedBody: {},
    body: {
      payout_account_id: "pacc_other",
      seller_id: "seller_other",
      status: "active",
    },
  } as unknown as Parameters<typeof POST>[0];
  const json = jest.fn();
  const setHeader = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { json, setHeader, status } as unknown as MedusaResponse;
  return { req, res, run, json, setHeader, status };
}

it("forwards only authenticated identity and seller context to the workflow", async () => {
  const f = fixture();
  await POST(f.req, f.res);
  expect(f.run).toHaveBeenCalledWith({
    input: {
      member_id: "member_own",
      auth_identity_id: "auth_own",
      seller_id: "seller_own",
    },
  });
  expect(f.setHeader).toHaveBeenCalledWith(
    "Cache-Control",
    "private, no-store",
  );
  expect(f.json).toHaveBeenCalledWith({
    payout_account: { id: "pacc_own", status: "active" },
  });
});

it.each([
  [MedusaError.Types.NOT_ALLOWED, 403],
  [MedusaError.Types.NOT_FOUND, 404],
  [MedusaError.Types.UNEXPECTED_STATE, 503],
] as const)("returns sanitized errors for %s", async (type, status) => {
  const f = fixture();
  f.run.mockRejectedValue(
    new MedusaError(type, "sensitive Stripe and identity details"),
  );
  await POST(f.req, f.res);
  expect(f.status).toHaveBeenCalledWith(status);
  expect(f.setHeader).toHaveBeenCalledWith(
    "Cache-Control",
    "private, no-store",
  );
  expect(JSON.stringify(f.json.mock.calls)).not.toContain("sensitive");
  expect(f.json.mock.calls[0][0]).not.toHaveProperty("payout_account");
});
