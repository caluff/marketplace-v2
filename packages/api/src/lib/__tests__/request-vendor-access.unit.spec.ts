import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";
import type { SellerMemberDTO } from "@mercurjs/types";
import { enableReadOnlyAccessScope, loadApplicant, requireVendorAccess, requireVendorMembership, reuseNativeMembershipRead } from "../vendor-onboarding/access";

function fixture(readOnly = true) {
  const member = { id: "mem_one", is_active: true };
  const seller = { id: "sel_one", status: "open", external_id: "vendor-application:app_one" };
  const membership = { id: "link_one", member_id: member.id, seller_id: seller.id, role_id: "role_support" };
  const native = {
    retrieveMember: jest.fn(async () => ({ ...member })),
    listSellerMembers: jest.fn(async () => [{ ...membership }]),
    retrieveSeller: jest.fn(async () => ({ ...seller })),
  };
  const applications = { listVendorApplications: jest.fn(async () => [{ id: "app_one" }]) };
  const container = createMedusaContainer();
  container.register({ seller: asValue(native), vendorOnboarding: asValue(applications) });
  if (readOnly) enableReadOnlyAccessScope(container);
  return { container, native, applications, member, seller, membership };
}

it("shares membership and approval across concurrent access reads within one enrolled request", async () => {
  const f = fixture();
  const [a, b] = await Promise.all([
    requireVendorAccess(f.container, "mem_one", "sel_one"),
    requireVendorAccess(f.container, "mem_one", "sel_one"),
    requireVendorMembership(f.container, "mem_one", "sel_one"),
  ]);
  expect(a).toEqual(b);
  expect(f.native.retrieveMember).toHaveBeenCalledTimes(1);
  expect(f.native.retrieveSeller).toHaveBeenCalledTimes(1);
  expect(f.applications.listVendorApplications).toHaveBeenCalledTimes(1);
});

it("does not retain access across requests or unregistered mutation/workflow containers", async () => {
  const f = fixture(false);
  await requireVendorAccess(f.container, "mem_one", "sel_one");
  f.member.is_active = false;
  await expect(requireVendorAccess(f.container, "mem_one", "sel_one")).rejects.toMatchObject({ code: "member_inactive" });
  const nextRequest = f.container.createScope() as MedusaContainer;
  enableReadOnlyAccessScope(nextRequest);
  await expect(requireVendorAccess(nextRequest, "mem_one", "sel_one")).rejects.toMatchObject({ code: "member_inactive" });
  expect(f.native.retrieveMember).toHaveBeenCalledTimes(3);
});

it("reuses native fresh membership relations but still verifies application approval", async () => {
  const f = fixture();
  const linked = { ...f.membership, seller: f.seller, member: f.member } as unknown as SellerMemberDTO;
  reuseNativeMembershipRead(f.container, "mem_one", "sel_one", linked);
  f.applications.listVendorApplications.mockResolvedValueOnce([]);
  await expect(requireVendorAccess(f.container, "mem_one", "sel_one")).rejects.toMatchObject({ code: "application_not_approved" });
  expect(f.native.retrieveMember).not.toHaveBeenCalled();
  expect(f.native.listSellerMembers).not.toHaveBeenCalled();
  expect(f.native.retrieveSeller).not.toHaveBeenCalled();
});

it("ignores a native context for another seller and rejects inactive members", async () => {
  const f = fixture();
  const foreign = { ...f.membership, seller_id: "sel_foreign", seller: f.seller, member: f.member } as unknown as SellerMemberDTO;
  reuseNativeMembershipRead(f.container, "mem_one", "sel_one", foreign);
  await requireVendorAccess(f.container, "mem_one", "sel_one");
  expect(f.native.retrieveMember).toHaveBeenCalledTimes(1);
  expect(() => reuseNativeMembershipRead(f.container, "mem_one", "sel_one", { ...f.membership, seller: f.seller, member: { ...f.member, is_active: false } } as unknown as SellerMemberDTO)).toThrow("member_inactive");
});

it("does not memoize failed access and isolates different seller keys", async () => {
  const f = fixture();
  f.native.retrieveMember.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(requireVendorAccess(f.container, "mem_one", "sel_one")).rejects.toThrow("database unavailable");
  await requireVendorAccess(f.container, "mem_one", "sel_one");
  await requireVendorAccess(f.container, "mem_one", "sel_other");
  expect(f.native.listSellerMembers).toHaveBeenNthCalledWith(2, { member_id: "mem_one", seller_id: "sel_other" });
});

it("starts independent applicant reads together and does not wait for verification to load memberships", async () => {
  const f = fixture();
  let releaseIdentity!: (identity: unknown) => void;
  let releaseVerification!: (verifications: unknown[]) => void;
  let membershipStarted!: () => void;
  const started = new Promise<void>(resolve => { membershipStarted = resolve; });
  f.native.listSellerMembers.mockImplementation(async () => { membershipStarted(); return [f.membership]; });
  const auth = {
    retrieveAuthIdentity: jest.fn(() => new Promise(resolve => { releaseIdentity = resolve; })),
    listAuthVerifications: jest.fn(() => new Promise<unknown[]>(resolve => { releaseVerification = resolve; })),
  };
  const graph = jest.fn(async () => ({ data: [{ id: "cus_one", has_account: true, email: "test@example.com" }] }));
  f.container.register({ auth: asValue(auth), query: asValue({ graph }) });
  const pending = loadApplicant(f.container, { customer_id: "cus_one", auth_identity_id: "auth_one" });
  expect(auth.retrieveAuthIdentity).toHaveBeenCalledTimes(1);
  expect(graph).toHaveBeenCalledTimes(1);
  releaseIdentity({ id: "auth_one", app_metadata: { customer_id: "cus_one", member_id: "mem_one" }, provider_identities: [{ provider: "emailpass", entity_id: "test@example.com" }] });
  await started;
  expect(auth.listAuthVerifications).toHaveBeenCalledTimes(1);
  expect(f.native.listSellerMembers).toHaveBeenCalledTimes(1);
  releaseVerification([{ verified_at: "verified" }]);
  expect((await pending).emailVerified).toBe(true);
});
