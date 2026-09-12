import { asValue } from "@medusajs/framework/awilix";
import type { AuthIdentityDTO } from "@medusajs/framework/types";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { loadApplicant } from "../vendor-onboarding/access";

function fixture() {
  const identity: AuthIdentityDTO = { id: "auth_google", app_metadata: { customer_id: "cus_google" }, provider_identities: [{ id: "google", provider: "google", entity_id: "subject", user_metadata: { email: "buyer@example.test" } }] };
  const verifications = jest.fn(async () => []);
  const container = createMedusaContainer();
  container.register({
    auth: asValue({ retrieveAuthIdentity: async () => identity, listAuthVerifications: verifications }),
    query: asValue({ graph: async () => ({ data: [{ id: "cus_google", email: "buyer@example.test", has_account: true }] }) }),
    seller: asValue({ listSellerMembers: async () => [] }),
  });
  const input = { auth_identity_id: "auth_google", customer_id: "cus_google" };
  return { container, identity, input, verifications };
}

it("allows native verified Google identities to apply without a password", async () => {
  const f = fixture();
  await expect(loadApplicant(f.container, f.input)).resolves.toMatchObject({ email: "buyer@example.test", emailVerified: true, member: null, memberships: [] });
});

it("rejects a provider subject used as email and Google email mismatches", async () => {
  const f = fixture();
  for (const email of [undefined, "someoneelse@example.test"]) {
    f.identity.provider_identities![0].user_metadata = { email };
    await expect(loadApplicant(f.container, f.input)).rejects.toMatchObject({ code: "identity_changed" });
  }
});

it("does not accept metadata alone without a Google subject", async () => {
  const f = fixture();
  f.identity.provider_identities![0].entity_id = "";
  await expect(loadApplicant(f.container, f.input)).rejects.toMatchObject({ code: "identity_changed" });
});

it("preserves customer-to-member relationships for Google-only applicants", async () => {
  const f = fixture();
  f.identity.app_metadata!.member_id = "mem_existing";
  f.container.register({ seller: asValue({ retrieveMember: async () => ({ id: "mem_existing", is_active: true }), listSellerMembers: async () => [{ member_id: "mem_existing", seller_id: "sel_existing" }] }) });
  await expect(loadApplicant(f.container, f.input)).resolves.toMatchObject({ member: { id: "mem_existing" }, memberships: [{ member_id: "mem_existing", seller_id: "sel_existing" }] });
});
