import type { MedusaContainer } from "@medusajs/framework/types";
import type { ApplicationRecord } from "../../modules/vendor-onboarding/service";
import {
  applicantResponse,
  adminApplicationList,
} from "../vendor-onboarding/views";
import {
  loadApplicant,
  onboardingService,
  requireVendorAccess,
  requireReviewer,
} from "../vendor-onboarding/access";
import { OnboardingError } from "../vendor-onboarding/errors";

jest.mock("../vendor-onboarding/access", () => ({
  loadApplicant: jest.fn(),
  onboardingService: jest.fn(),
  requireVendorAccess: jest.fn(),
  requireReviewer: jest.fn(),
}));

function fixture(memberId = "member_1") {
  const now = new Date("2026-09-08T00:00:00.000Z");
  const application = {
    id: "app_1",
    auth_identity_id: "auth_1",
    customer_id: "cus_1",
    applicant_email: "buyer@example.test",
    terms_version: "v1",
    approval_operation_id: null,
    approval_error_code: null,
    deleted_at: null,
    member_id: "member_1",
    seller_id: "seller_1",
    status: "approved",
    approval_state: "complete",
    version: 1,
    current_step: "review",
    submission_revision: 1,
    submitted_at: now,
    reviewed_at: now,
    created_at: now,
    updated_at: now,
    submitted_data: null,
    review: null,
    data: {
      responsible: { first_name: "Jane", last_name: "Buyer", phone: "" },
      store: {
        name: "Studio",
        handle: "studio",
        description: "",
        website_url: "",
      },
      activity: {
        business_type: "individual",
        company_name: "",
        business_address: {
          address_1: "",
          address_2: "",
          city: "",
          province: "",
          postal_code: "",
          country_code: "us",
        },
        currency_code: "usd",
        category_ids: [],
        description: "",
      },
    },
  } as ApplicationRecord;
  const seller = {
    id: "seller_1",
    name: "Studio",
    handle: "studio",
    status: "open",
    currency_code: "usd",
  };
  const listSellers = jest.fn(async () => [seller]);
  const graph = jest.fn();
  const container = {
    resolve: () => ({ listSellers, graph }),
  } as unknown as MedusaContainer;
  jest
    .mocked(loadApplicant)
    .mockResolvedValue({
      email: "buyer@example.test",
      emailVerified: true,
      memberships: [{ member_id: memberId, seller_id: "seller_1" }],
    } as Awaited<ReturnType<typeof loadApplicant>>);
  jest
    .mocked(onboardingService)
    .mockReturnValue({
      listVendorApplications: async () => [application],
      listAndCountVendorApplicationEvents: async () => [[], 0],
      listApplicationQueue: async () => [[], 0],
    } as unknown as ReturnType<typeof onboardingService>);
  jest
    .mocked(requireVendorAccess)
    .mockResolvedValue({ seller } as Awaited<
      ReturnType<typeof requireVendorAccess>
    >);
  return { container, listSellers, graph };
}

beforeEach(() => jest.resetAllMocks());

it("reuses the verified seller and access result for the matching live membership", async () => {
  const f = fixture();
  const response = await applicantResponse(f.container, {
    customer_id: "cus_1",
    auth_identity_id: "auth_1",
  });
  expect(response.applicant.existing_vendor_access).toBe(true);
  expect(requireVendorAccess).toHaveBeenCalledTimes(1);
  expect(f.listSellers).not.toHaveBeenCalled();
});

it("does not substitute an application's old member for the current identity's membership", async () => {
  const f = fixture("member_current");
  jest
    .mocked(requireVendorAccess)
    .mockRejectedValueOnce(new OnboardingError("member_inactive", 403));
  const response = await applicantResponse(f.container, {
    customer_id: "cus_1",
    auth_identity_id: "auth_1",
  });
  expect(response.applicant.existing_vendor_access).toBe(true);
  expect(requireVendorAccess).toHaveBeenLastCalledWith(
    f.container,
    "member_current",
    "seller_1",
  );
});

it("does not infer current access from an unrelated approved membership", async () => {
  const f = fixture("member_current");
  jest
    .mocked(requireVendorAccess)
    .mockImplementation(async (_container, memberId) => {
      if (memberId === "member_current")
        throw new OnboardingError("member_inactive", 403);
      return {
        seller: { id: "seller_1", name: "Studio", status: "open" },
      } as Awaited<ReturnType<typeof requireVendorAccess>>;
    });
  const response = await applicantResponse(f.container, {
    customer_id: "cus_1",
    auth_identity_id: "auth_1",
  });
  expect(response.applicant.existing_vendor_access).toBe(false);
});

it("does not query customer records for an empty admin queue", async () => {
  const f = fixture();
  await expect(
    adminApplicationList(f.container, "admin_1", {
      status: "submitted",
      limit: 20,
      offset: 0,
    }),
  ).resolves.toMatchObject({ applications: [], count: 0 });
  expect(requireReviewer).toHaveBeenCalled();
  expect(f.graph).not.toHaveBeenCalled();
});
