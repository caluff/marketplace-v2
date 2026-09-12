import { asValue } from "@medusajs/framework/awilix";
import { getAuthContextFromJwtToken } from "@medusajs/framework/http";
import type { AuthIdentityDTO, ProviderIdentityDTO } from "@medusajs/framework/types";
import { createMedusaContainer, generateJwtToken } from "@medusajs/framework/utils";
import { completeGoogleAuth, type CompleteGoogleAuthWorkflowInput } from "../steps/complete-google-auth";

const nativeCreate = jest.fn();
jest.mock("@medusajs/core-flows", () => ({ createCustomerAccountWorkflow: () => ({ run: nativeCreate }) }));

const secret = "test-google-auth-secret-at-least-32-characters";
function fixture(actorType: "customer" | "user" | "member" = "customer", email = "buyer@example.test") {
  const google: ProviderIdentityDTO = { id: "provider_google", provider: actorType === "user" ? "google-admin" : "google", entity_id: "google-subject", auth_identity_id: "auth_google", user_metadata: { email, given_name: "Buyer" } };
  const identities: Record<string, AuthIdentityDTO> = {
    auth_google: { id: "auth_google", app_metadata: {}, provider_identities: [google] },
    auth_original: { id: "auth_original", app_metadata: { customer_id: "cus_one", member_id: "mem_one", user_id: "user_one", preference: "preserve" }, provider_identities: [{ id: "provider_password", provider: "emailpass", entity_id: email }] },
  };
  const actorIds = { customer: "cus_one", user: "user_one", member: "mem_one" };
  let actors = [{ id: actorIds[actorType], email, has_account: true, is_active: true }];
  const auth = {
    retrieveAuthIdentity: jest.fn(async (id: string) => structuredClone(identities[id])),
    listAuthIdentities: jest.fn(async (filter: { provider_identities: { provider: string; entity_id: string } }) => structuredClone(Object.values(identities).filter(identity => identity.provider_identities?.some(provider => provider.provider === filter.provider_identities.provider && provider.entity_id === filter.provider_identities.entity_id)))),
    updateProviderIdentities: jest.fn(async (update: { id: string; auth_identity_id: string }) => {
      const source = Object.values(identities).find(identity => identity.provider_identities?.some(provider => provider.id === update.id))!;
      const provider = source.provider_identities!.find(provider => provider.id === update.id)!;
      source.provider_identities = source.provider_identities!.filter(provider => provider.id !== update.id);
      provider.auth_identity_id = update.auth_identity_id;
      identities[update.auth_identity_id].provider_identities!.push(provider);
      return provider;
    }),
  };
  const graph = jest.fn(async ({ filters }: { filters: { id?: string } }) => ({ data: actors.filter(actor => !filters.id || actor.id === filters.id) }));
  let queue: Promise<unknown> = Promise.resolve();
  const execute = jest.fn((_key: string, work: () => Promise<unknown>) => {
    const next = queue.then(work);
    queue = next.catch(() => undefined);
    return next;
  });
  const container = createMedusaContainer();
  container.register({ auth: asValue(auth), query: asValue({ graph }), locking: asValue({ execute }), configModule: asValue({ projectConfig: { http: { jwtSecret: secret } } }) });
  const input: CompleteGoogleAuthWorkflowInput = { actor_type: actorType, auth_context: { actor_id: "", actor_type: actorType, auth_identity_id: "auth_google", auth_provider: google.provider, app_metadata: {}, user_metadata: {} } };
  const proof = (overrides: Record<string, unknown> = {}, signingSecret = secret) => generateJwtToken({ actor_id: actorIds[actorType], actor_type: actorType, auth_identity_id: "auth_original", auth_provider: "emailpass", ...overrides }, { secret: signingSecret, expiresIn: "10m" });
  return { container, identities, google, input, proof, auth, graph, execute, noActors: () => { actors = []; } };
}

beforeEach(() => { nativeCreate.mockReset(); });

it("requires existing account proof without linking by matching email", async () => {
  const f = fixture();
  await expect(completeGoogleAuth(f.container, f.input)).resolves.toEqual({ status: "link_required" });
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
  expect(nativeCreate).not.toHaveBeenCalled();
});

it.each(["customer", "user", "member"] as const)("links %s into the original identity and emits only a token requiring native checks", async actorType => {
  const f = fixture(actorType);
  const before = structuredClone(f.identities.auth_original.app_metadata);
  const result = await completeGoogleAuth(f.container, { ...f.input, existing_token: f.proof() });
  expect(result.status).toBe("complete");
  if (result.status !== "complete") throw new Error("Expected complete");
  const context = getAuthContextFromJwtToken(`Bearer ${result.token}`, secret, ["bearer"], [actorType]);
  expect(context).toMatchObject({ actor_id: "", auth_identity_id: "auth_original", auth_provider: f.google.provider, app_metadata: {} });
  expect(f.identities.auth_original.app_metadata).toEqual(before);
  expect(f.identities.auth_original.provider_identities).toHaveLength(2);
  expect(f.identities.auth_google.provider_identities).toEqual([]);
  expect(nativeCreate).not.toHaveBeenCalled();
});

it.each([
  { actor_id: "" },
  { actor_type: "user" },
  { auth_provider: "google" },
  { actor_id: "cus_foreign" },
  { iat: 1 },
])("rejects untrusted or unfinished existing authentication %j", async overrides => {
  const f = fixture();
  const existing = f.proof(overrides);
  await expect(completeGoogleAuth(f.container, { ...f.input, existing_token: existing })).rejects.toMatchObject({ type: "unauthorized" });
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
});

it("rejects forged signatures and different emails", async () => {
  const f = fixture();
  await expect(completeGoogleAuth(f.container, { ...f.input, existing_token: f.proof({}, "another-secret") })).rejects.toMatchObject({ type: "unauthorized" });
  f.identities.auth_original.provider_identities![0].entity_id = "other@example.test";
  await expect(completeGoogleAuth(f.container, { ...f.input, existing_token: f.proof() })).rejects.toMatchObject({ type: "unauthorized" });
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
});

it("does not merge established Google accounts or replace another linked Google provider", async () => {
  const f = fixture();
  f.identities.auth_google.app_metadata = { member_id: "mem_foreign" };
  await expect(completeGoogleAuth(f.container, { ...f.input, existing_token: f.proof() })).rejects.toMatchObject({ type: "not_allowed" });
  f.identities.auth_google.app_metadata = {};
  f.identities.auth_original.provider_identities!.push({ ...f.google, id: "other_google", entity_id: "other-subject" });
  await expect(completeGoogleAuth(f.container, { ...f.input, existing_token: f.proof() })).rejects.toMatchObject({ type: "not_allowed" });
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
});

it("does not switch accounts when Google is already registered during explicit linking", async () => {
  const f = fixture();
  f.identities.auth_google.app_metadata = { customer_id: "cus_other" };
  await expect(completeGoogleAuth(f.container, { ...f.input, existing_token: f.proof() })).rejects.toMatchObject({ type: "not_allowed" });
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
});

it("allows a repeated explicit link only for the same canonical account", async () => {
  const f = fixture();
  await completeGoogleAuth(f.container, { ...f.input, existing_token: f.proof() });
  f.input.auth_context.auth_identity_id = "auth_original";
  await expect(completeGoogleAuth(f.container, { ...f.input, existing_token: f.proof() })).resolves.toMatchObject({ status: "complete" });
  expect(f.auth.updateProviderIdentities).toHaveBeenCalledTimes(1);
});

it.each(["user", "member"] as const)("never creates an unknown %s", async actorType => {
  const f = fixture(actorType);
  f.noActors();
  await expect(completeGoogleAuth(f.container, f.input)).rejects.toMatchObject({ type: "not_allowed" });
  expect(nativeCreate).not.toHaveBeenCalled();
});

it("uses native compensated customer registration and makes concurrent callbacks idempotent", async () => {
  const f = fixture();
  f.noActors();
  nativeCreate.mockImplementation(async () => { f.identities.auth_google.app_metadata = { customer_id: "cus_created" }; });
  f.graph.mockImplementation(async ({ filters }) => ({ data: filters.id === "cus_created" ? [{ id: "cus_created", email: "buyer@example.test", has_account: true, is_active: true }] : [] }));
  const results = await Promise.all([completeGoogleAuth(f.container, f.input), completeGoogleAuth(f.container, f.input)]);
  expect(results.map(result => result.status)).toEqual(["complete", "complete"]);
  expect(nativeCreate).toHaveBeenCalledTimes(1);
  expect(nativeCreate).toHaveBeenCalledWith({ input: { authIdentityId: "auth_google", customerData: { email: "buyer@example.test", first_name: "Buyer" } } });
});

it("serializes simultaneous linking and rejects replay of an orphaned identity", async () => {
  const f = fixture();
  const request = { ...f.input, existing_token: f.proof() };
  const results = await Promise.allSettled([completeGoogleAuth(f.container, request), completeGoogleAuth(f.container, request)]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(f.auth.updateProviderIdentities).toHaveBeenCalledTimes(1);
});

it("signs in an existing Gmail customer without a password while preserving the canonical account", async () => {
  const f = fixture("customer", "buyer@gmail.com");
  f.google.user_metadata!.email = " Buyer@Gmail.com ";
  const metadata = structuredClone(f.identities.auth_original.app_metadata);
  const passwordProvider = structuredClone(f.identities.auth_original.provider_identities![0]);
  const result = await completeGoogleAuth(f.container, f.input);
  if (result.status !== "complete") throw new Error("Expected seamless Gmail completion");
  expect(getAuthContextFromJwtToken(`Bearer ${result.token}`, secret, ["bearer"], ["customer"])).toMatchObject({ actor_id: "", auth_identity_id: "auth_original", auth_provider: "google", app_metadata: {} });
  expect(f.auth.listAuthIdentities).toHaveBeenCalledWith({ provider_identities: { provider: "emailpass", entity_id: "buyer@gmail.com" } }, { relations: ["provider_identities"], take: 2 });
  expect(f.identities.auth_original.app_metadata).toEqual(metadata);
  expect(f.identities.auth_original.provider_identities![0]).toEqual(passwordProvider);
  expect(f.identities.auth_original.provider_identities![1]).toMatchObject({ id: "provider_google", auth_identity_id: "auth_original" });
  expect(nativeCreate).not.toHaveBeenCalled();
});

it.each(["buyer@example.test", "buyer@googlemail.com", "buyer@gmail.com.attacker.test", "buyer+alias@gmail.com.attacker.test"])("requires explicit proof when Google is not authoritative for %s", async email => {
  const f = fixture("customer", email);
  await expect(completeGoogleAuth(f.container, f.input)).resolves.toEqual({ status: "link_required" });
  expect(f.auth.listAuthIdentities).not.toHaveBeenCalled();
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
});

it.each(["user", "member"] as const)("keeps %s Gmail linking explicit", async actorType => {
  const f = fixture(actorType, "buyer@gmail.com");
  await expect(completeGoogleAuth(f.container, f.input)).resolves.toEqual({ status: "link_required" });
  expect(f.auth.listAuthIdentities).not.toHaveBeenCalled();
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
});

it("refuses Gmail linking when the password identity belongs to another customer", async () => {
  const f = fixture("customer", "buyer@gmail.com");
  f.identities.auth_original.app_metadata!.customer_id = "cus_foreign";
  await expect(completeGoogleAuth(f.container, f.input)).rejects.toMatchObject({ type: "not_allowed" });
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
});

it("rejects mismatched live customer or password-provider email during Gmail linking", async () => {
  const f = fixture("customer", "buyer@gmail.com");
  f.graph.mockResolvedValue({ data: [{ id: "cus_one", email: "other@gmail.com", has_account: true, is_active: true }] });
  await expect(completeGoogleAuth(f.container, f.input)).rejects.toMatchObject({ type: "unauthorized" });
  f.identities.auth_original.provider_identities![0].entity_id = "other@gmail.com";
  f.auth.listAuthIdentities.mockResolvedValue([f.identities.auth_original]);
  await expect(completeGoogleAuth(f.container, f.input)).rejects.toMatchObject({ type: "not_allowed" });
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
});

it("does not replace another Google subject or merge an established Google identity", async () => {
  const f = fixture("customer", "buyer@gmail.com");
  f.identities.auth_original.provider_identities!.push({ ...f.google, id: "different_google", entity_id: "different-subject" });
  await expect(completeGoogleAuth(f.container, f.input)).rejects.toMatchObject({ type: "not_allowed" });
  f.identities.auth_original.provider_identities!.pop();
  f.identities.auth_google.app_metadata = { member_id: "mem_foreign" };
  await expect(completeGoogleAuth(f.container, f.input)).rejects.toMatchObject({ type: "not_allowed" });
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
});

it("fails closed for missing or ambiguous Gmail password identities and duplicate customers", async () => {
  const f = fixture("customer", "buyer@gmail.com");
  for (const candidates of [[], [f.identities.auth_original, { ...f.identities.auth_original, id: "auth_duplicate" }]]) {
    f.auth.listAuthIdentities.mockResolvedValue(candidates);
    await expect(completeGoogleAuth(f.container, f.input)).rejects.toMatchObject({ type: "not_allowed" });
  }
  f.graph.mockResolvedValue({ data: ["cus_one", "cus_duplicate"].map(id => ({ id, email: "buyer@gmail.com", has_account: true, is_active: true })) });
  await expect(completeGoogleAuth(f.container, f.input)).rejects.toMatchObject({ type: "not_allowed" });
  expect(f.auth.updateProviderIdentities).not.toHaveBeenCalled();
});

it("serializes Gmail auto-linking so concurrent callbacks cannot create duplicate accounts", async () => {
  const f = fixture("customer", "buyer@gmail.com");
  const results = await Promise.allSettled([completeGoogleAuth(f.container, f.input), completeGoogleAuth(f.container, f.input)]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(f.auth.updateProviderIdentities).toHaveBeenCalledTimes(1);
  expect(nativeCreate).not.toHaveBeenCalled();
  f.input.auth_context.auth_identity_id = "auth_original";
  await expect(completeGoogleAuth(f.container, f.input)).resolves.toMatchObject({ status: "complete" });
});
