import { asValue } from "@medusajs/framework/awilix";
import type { AuthContext } from "@medusajs/framework/http";
import { getAuthContextFromJwtToken } from "@medusajs/framework/http";
import type { AuthIdentityDTO } from "@medusajs/framework/types";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { consumeVendorSession, issueVendorSession } from "../steps/vendor-session";

const secret = "test-vendor-handoff-secret-at-least-32-characters";
function fixture(provider: "emailpass" | "google" = "emailpass") {
  const identity: AuthIdentityDTO = { id: "auth_buyer", app_metadata: { customer_id: "cus_buyer", member_id: "mem_buyer" }, provider_identities: [{ id: "provider_password", provider: "emailpass", entity_id: "buyer@example.test" }, { id: "provider_google", provider: "google", entity_id: "google-subject", user_metadata: { email: "buyer@example.test" } }] };
  const member = { id: "mem_buyer", email: "buyer@example.test", is_active: true };
  const seller = { id: "sel_buyer", status: "open" };
  let memberships = [{ member_id: "mem_buyer", seller_id: "sel_buyer" }];
  const storage = new Map<string, object>();
  const caching = { set: jest.fn(async ({ key, data }: { key: string; data: object }) => { storage.set(key, structuredClone(data)); }), get: jest.fn(async ({ key }: { key: string }) => storage.get(key)), clear: jest.fn(async ({ key }: { key: string }) => { storage.delete(key); }) };
  let queue: Promise<unknown> = Promise.resolve();
  const execute = (_key: string, work: () => Promise<unknown>) => { const next = queue.then(work); queue = next.catch(() => undefined); return next; };
  const http = { jwtSecret: secret, jwtExpiresIn: "1h", authMethodsPerActor: { member: ["emailpass", "google"] }, authVerificationsPerActor: {} as Record<string, { auth_provider: string; entity_type: string }[]> };
  const container = createMedusaContainer();
  container.register({
    caching: asValue(caching), locking: asValue({ execute }), configModule: asValue({ projectConfig: { http } }),
    auth: asValue({ retrieveAuthIdentity: async () => identity, listAuthVerifications: async () => [] }),
    query: asValue({ graph: async ({ entity }: { entity: string }) => ({ data: entity === "customer" ? [{ id: "cus_buyer", email: "buyer@example.test", has_account: true }] : [{ id: member.id, rbac_roles: [] }] }) }),
    seller: asValue({ retrieveMember: async () => member, retrieveSeller: async () => seller, listSellerMembers: async () => memberships }),
  });
  const context: AuthContext & { exp: number } = { actor_id: "cus_buyer", actor_type: "customer", auth_identity_id: identity.id, auth_provider: provider, app_metadata: {}, user_metadata: {}, exp: Math.floor(Date.now() / 1000) + 3600 };
  return { container, context, identity, member, seller, caching, storage, http, removeMemberships: () => { memberships = []; } };
}

it.each(["emailpass", "google"] as const)("transfers an authenticated %s customer to its existing member with the same auth identity", async provider => {
  const f = fixture(provider);
  const issued = await issueVendorSession(f.container, f.context);
  expect(issued.code).toMatch(/^[a-f0-9]{64}$/);
  expect([...f.storage.keys()][0]).not.toContain(issued.code);
  const result = await consumeVendorSession(f.container, issued);
  expect(result.status).toBe("authenticated");
  expect(getAuthContextFromJwtToken(`Bearer ${result.token}`, secret, ["bearer"], ["member"])).toMatchObject({ actor_id: "mem_buyer", auth_identity_id: "auth_buyer", auth_provider: provider });
  expect(f.identity.app_metadata).toEqual({ customer_id: "cus_buyer", member_id: "mem_buyer" });
  expect(f.storage.size).toBe(0);
});

it("rejects partial MFA, registration, foreign actor and expired customer tokens", async () => {
  const f = fixture();
  for (const overrides of [{ actor_id: "" }, { actor_type: "member" }, { actor_id: "cus_foreign" }, { auth_provider: "google-admin" }, { exp: 1 }]) {
    await expect(issueVendorSession(f.container, { ...f.context, ...overrides })).rejects.toThrow();
  }
  expect(f.caching.set).not.toHaveBeenCalled();
});

it("never selects a member by matching email or creates seller access", async () => {
  const f = fixture();
  delete f.identity.app_metadata!.member_id;
  await expect(issueVendorSession(f.container, f.context)).rejects.toThrow();
  expect(f.caching.set).not.toHaveBeenCalled();
});

it("rejects inactive members, unavailable sellers, missing memberships and provider policies", async () => {
  const f = fixture();
  f.member.is_active = false;
  await expect(issueVendorSession(f.container, f.context)).rejects.toThrow();
  f.member.is_active = true;
  f.seller.status = "closed";
  await expect(issueVendorSession(f.container, f.context)).rejects.toThrow();
  f.seller.status = "open";
  f.http.authMethodsPerActor.member = ["google"];
  await expect(issueVendorSession(f.container, f.context)).rejects.toThrow();
  f.http.authMethodsPerActor.member = ["emailpass"];
  f.removeMemberships();
  await expect(issueVendorSession(f.container, f.context)).rejects.toThrow();
});

it("retains stricter native member verification without returning an authenticated member token", async () => {
  const f = fixture();
  f.http.authVerificationsPerActor.member = [{ auth_provider: "emailpass", entity_type: "email" }];
  const result = await consumeVendorSession(f.container, await issueVendorSession(f.container, f.context));
  expect(result).toMatchObject({ status: "verification_required", email: "buyer@example.test" });
  expect(getAuthContextFromJwtToken(`Bearer ${result.token}`, secret, ["bearer"], ["member"])?.actor_id).toBe("");
});

it("consumes a code once under concurrent attempts and rejects replay", async () => {
  const f = fixture();
  const issued = await issueVendorSession(f.container, f.context);
  const attempts = await Promise.allSettled([consumeVendorSession(f.container, issued), consumeVendorSession(f.container, issued)]);
  expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
  await expect(consumeVendorSession(f.container, issued)).rejects.toThrow();
});

it("rejects expired codes even if a cache entry remains", async () => {
  const f = fixture();
  const issued = await issueVendorSession(f.container, f.context);
  const key = [...f.storage.keys()][0];
  f.storage.set(key, { ...f.storage.get(key), expires_at: 1 });
  await expect(consumeVendorSession(f.container, issued)).rejects.toThrow();
  expect(f.storage.size).toBe(0);
});

it("rechecks revocation and exact member identity before consumption", async () => {
  for (const change of ["inactive", "foreign-member", "membership"] as const) {
    const f = fixture();
    const issued = await issueVendorSession(f.container, f.context);
    if (change === "inactive") f.member.is_active = false;
    if (change === "foreign-member") f.member.id = "mem_foreign";
    if (change === "membership") f.removeMemberships();
    await expect(consumeVendorSession(f.container, issued)).rejects.toThrow();
    expect(f.storage.size).toBe(0);
  }
});
