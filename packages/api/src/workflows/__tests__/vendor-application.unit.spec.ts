import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { SellerRole } from "@mercurjs/types";
import { mutateVendorApplicationWorkflow } from "../mutate-vendor-application";
import { requireVendorAccess } from "../../lib/vendor-onboarding/access";
import type { ApplicationRecord, MutationRecord } from "../../modules/vendor-onboarding/service";
import type VendorOnboardingService from "../../modules/vendor-onboarding/service";
import type { DraftData } from "../../lib/vendor-onboarding/schemas";
import { warehouseFixture } from "./fixtures/vendor-warehouse";

const data: DraftData = {
  responsible: { first_name: "Jane", last_name: "Buyer", phone: "+12025550123" },
  store: { name: "Small Studio", handle: "small-studio", description: "Handmade pieces from our small studio.", website_url: "" },
  activity: { business_type: "individual", company_name: "", business_address: { address_1: "1 Main Street", address_2: "", city: "Washington", province: "DC", postal_code: "20001", country_code: "us" }, currency_code: "usd", category_ids: ["pcat_craft"], description: "Handmade home goods" },
};
const mutationId = "90885306-3217-46ab-8cef-fcf0ac647f8d";

function fixture(options: { reused?: boolean; verified?: boolean; failFinalize?: boolean; foreignMember?: boolean; inactive?: boolean; loseMemberResponse?: boolean; loseBindResponse?: boolean; loseCommitResponse?: boolean; loseSellerResponse?: boolean; unavailableCommitReadback?: boolean; loseCreateResponse?: boolean; loseLinkResponse?: boolean } = {}) {
  const warehouse = warehouseFixture(options);
  const operations: string[] = [];
  const now = new Date();
  let app = { id: "vapp_one", customer_id: "cus_buyer", auth_identity_id: "auth_buyer", applicant_email: "buyer@example.test", status: "submitted", version: 2, current_step: "review", data, submitted_data: data, submission_revision: 1, submitted_at: now, reviewed_at: null, review: null, terms_version: "v1", seller_id: null, member_id: null, approval_state: "idle", approval_operation_id: null, approval_error_code: null, created_at: now, updated_at: now, deleted_at: null } as ApplicationRecord;
  let mutation: MutationRecord | null = null;
  let attemptedFinalize = false;
  let metadata: Record<string, unknown> = { customer_id: "cus_buyer", preference: "preserve", ...(options.reused ? { member_id: "mem_reused" } : {}) };
  let members: { id: string; email: string; is_active: boolean; metadata: Record<string, unknown> }[] = options.reused ? [{ id: "mem_reused", email: "buyer@example.test", is_active: !options.inactive, metadata: { original: true } }] : [];
  let sellers: Record<string, unknown>[] = [];
  let memberships: { id: string; seller_id: string; member_id: string; role_id: string; is_owner: boolean }[] = [];
  const events: string[] = [];
  const native = {
    listMembers: jest.fn(async ({ id }) => members.filter(member => member.id === id)),
    retrieveMember: jest.fn(async (id) => members.find(member => member.id === id)),
    createMembers: jest.fn(async (input) => { if (options.foreignMember) throw new Error("duplicate email"); operations.push("create-member"); members.push(input); if (options.loseMemberResponse) throw new Error("member response lost"); return input; }),
    deleteMembers: jest.fn(async (id) => { operations.push("delete-member"); members = members.filter(member => member.id !== id); }),
    listSellerMembers: jest.fn(async (filter) => memberships.filter(member => Object.entries(filter).every(([key, value]) => member[key] === value))),
    createSellerMembers: jest.fn(async (inputs) => { operations.push("create-membership"); memberships = inputs.map(input => ({ id: "sm_one", ...input })); return memberships; }),
    deleteSellerMembers: jest.fn(async () => { operations.push("delete-membership"); memberships = []; }),
    listSellers: jest.fn(async (filter) => structuredClone(sellers.filter(seller => Object.entries(filter).every(([key, value]) => seller[key] === value)))),
    retrieveSeller: jest.fn(async (id) => sellers.find(seller => seller.id === id)),
    createSellers: jest.fn(async (inputs) => { operations.push("create-seller"); sellers = inputs.map(input => ({ id: "sel_one", ...input })); if (options.loseSellerResponse) throw new Error("seller response lost"); return structuredClone(sellers); }),
    updateSellers: jest.fn(async (inputs) => { operations.push(`seller:${inputs[0].status}`); sellers = sellers.map(seller => ({ ...seller, ...inputs.find(input => input.id === seller.id) })); return structuredClone(sellers); }),
    deleteSellers: jest.fn(async () => { operations.push("delete-seller"); sellers = []; }),
    createSellerAddresses: jest.fn(async (input) => ({ id: "address_one", ...input })),
    listSellerAddresses: jest.fn(async () => [{ id: "address_one" }]),
    deleteSellerAddresses: jest.fn(async () => undefined),
  };
  const onboarding = {
    ...warehouse.onboarding,
    retrieveVendorApplication: jest.fn(async () => structuredClone(app)),
    retrieveVendorApplicationMutation: jest.fn(async () => { if (options.unavailableCommitReadback && attemptedFinalize) throw new Error("database unavailable"); return structuredClone(mutation); }),
    listVendorApplications: jest.fn(async filter => Object.entries(filter).every(([key, value]) => app[key] === value) ? [structuredClone(app)] : []),
    listVendorApplicationMutations: jest.fn(async () => mutation ? [structuredClone(mutation)] : []),
    atomicMutation: jest.fn(async (input: Parameters<VendorOnboardingService["atomicMutation"]>[0]) => {
      operations.push("claim");
      mutation = { id: "vappmut_operation", application_id: app.id, customer_id: app.customer_id, mutation_id: input.mutation_id, actor_id: input.actor_id, request_hash: input.request_hash, expected_version: input.expected_version, operation: input.operation, transaction_id: input.transaction_id, state: "processing", member_id: null, seller_id: null, created_member: false, warehouse_id: null, warehouse_ready: false, result: null, error_code: null, created_at: now, updated_at: now, deleted_at: null };
      app = { ...app, approval_state: "processing", approval_operation_id: mutation.id };
      mutation.result = structuredClone(app);
      return { application: structuredClone(app), mutation: structuredClone(mutation), replay: false };
    }),
    fenceApproval: jest.fn(async (_id, update) => {
      if (!mutation) throw new Error("No claim");
      if (update.complete) attemptedFinalize = true;
      if (update.complete && options.failFinalize) throw new Error("finalize unavailable");
      Object.assign(mutation, update);
      if (update.complete) { operations.push("commit"); app = { ...app, status: "approved", approval_state: "complete", member_id: mutation.member_id, seller_id: mutation.seller_id, version: 3 }; mutation.state = "complete"; events.push("approved"); if (options.loseCommitResponse) throw new Error("commit response lost"); }
      if (update.failed) { operations.push("failed"); app.approval_state = "failed"; mutation.state = "failed"; }
      return { application: structuredClone(app), mutation: structuredClone(mutation) };
    }),
  };
  const container = createMedusaContainer();
  container.register({
    stock_location: asValue(warehouse.stock), link: asValue(warehouse.link),
    vendorOnboarding: asValue(onboarding), seller: asValue(native),
    auth: asValue({ retrieveAuthIdentity: jest.fn(async () => ({ id: "auth_buyer", app_metadata: structuredClone(metadata), provider_identities: [{ provider: "emailpass", entity_id: "buyer@example.test" }] })), listAuthVerifications: jest.fn(async () => options.verified === false ? [] : [{ verified_at: now }]), updateAuthIdentities: jest.fn(async (input) => { operations.push("bind"); metadata = structuredClone(input.app_metadata); if (options.loseBindResponse) throw new Error("bind response lost"); return input; }) }),
    query: asValue({ graph: jest.fn(async ({ entity, filters }) => ({ data: entity === "customer" ? [{ id: "cus_buyer", email: "buyer@example.test", has_account: true }] : entity === "user" ? [{ id: "user_reviewer", rbac_roles: [{ id: "role_review" }] }] : entity === "store" ? [{ supported_currencies: [{ currency_code: "usd" }] }] : entity === "product_category" ? [{ id: "pcat_craft" }] : entity === "seller" ? structuredClone(sellers) : await warehouse.graph({ entity, filters }) })) }),
    rbac: asValue({ listPoliciesForRole: jest.fn(async () => [{ resource: "seller", operation: "*" }]), listRbacRoles: jest.fn(async ({ id }) => id.map(id => ({ id }))), listRbacPolicies: jest.fn(async () => []), listRbacRolePolicies: jest.fn(async () => []), createRbacRolePolicies: jest.fn(async () => []) }),
    locking: asValue({ acquire: jest.fn(async () => { operations.push("lock"); }), release: jest.fn(async () => { operations.push("unlock"); return true; }) }),
    event_bus: asValue({ emit: jest.fn(async () => undefined), releaseGroupedEvents: jest.fn(async () => undefined), clearGroupedEvents: jest.fn(async () => undefined) }),
    logger: asValue({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }),
  });
  return { container, native, onboarding, warehouse, operations, events, state: () => ({ app, metadata, members, sellers, memberships }) };
}
const approve = { operation: "review" as const, application_id: "vapp_one", reviewer_id: "user_reviewer", body: { mutation_id: mutationId, expected_version: 2, decision: "approve" as const } };

describe("vendor application native approval saga", () => {
  it("reconciles a native seller commit whose response was lost before its native compensation was registered", async () => {
    const f = fixture({ loseSellerResponse: true });
    await expect(mutateVendorApplicationWorkflow(f.container).run({ input: approve })).rejects.toBeDefined();
    expect(f.state().sellers).toEqual([]);
    expect(f.state().members).toEqual([]);
    expect(f.state().app.approval_state).toBe("failed");
  });
  it.each([{ loseCommitResponse: true }, { failFinalize: true }])("retains fenced native resources when database commit outcome cannot be verified %j", async options => {
    const f = fixture({ ...options, unavailableCommitReadback: true });
    const { result } = await mutateVendorApplicationWorkflow(f.container).run({ input: approve });
    expect(result.processing).toBe(true);
    expect(f.native.deleteMembers).not.toHaveBeenCalled();
    expect(f.native.deleteSellers).not.toHaveBeenCalled();
    expect(f.state().members).toHaveLength(1);
    expect(f.state().metadata.member_id).toBe("mem_operation");
  });
  it.each([{ loseMemberResponse: true }, { loseBindResponse: true }, { loseCommitResponse: true }, { loseCreateResponse: true }, { loseLinkResponse: true }])("recovers a committed write with a lost response %j", async options => {
    const f = fixture(options);
    await mutateVendorApplicationWorkflow(f.container).run({ input: approve });
    expect(f.state().app.status).toBe("approved");
    expect(f.state().metadata).toEqual({ customer_id: "cus_buyer", preference: "preserve", member_id: "mem_operation" });
    expect(f.native.createMembers).toHaveBeenCalledTimes(1);
    expect(f.native.createSellers).toHaveBeenCalledTimes(1);
    expect(f.events).toEqual(["approved"]);
    expect(f.warehouse.locations).toHaveLength(1);
    expect(f.warehouse.claims[0].state).toBe("ready");
  });
  it("uses native account creation/approval and binds the same identity without removing buyer metadata", async () => {
    const f = fixture();
    await mutateVendorApplicationWorkflow(f.container).run({ input: approve });
    expect(f.native.createSellers).toHaveBeenCalledTimes(1);
    expect(f.state().memberships[0]).toMatchObject({ member_id: "mem_operation", is_owner: true, role_id: SellerRole.SELLER_ADMINISTRATION });
    expect(f.state().metadata).toEqual({ customer_id: "cus_buyer", preference: "preserve", member_id: "mem_operation" });
    expect(f.state().app.status).toBe("approved");
    expect(f.events).toEqual(["approved"]);
    expect(f.operations.indexOf("seller:open")).toBeLessThan(f.operations.indexOf("bind"));
    expect(f.operations.indexOf("bind")).toBeLessThan(f.operations.indexOf("commit"));
  });
  it("reuses only an explicitly bound member and never creates a replacement", async () => {
    const f = fixture({ reused: true });
    await mutateVendorApplicationWorkflow(f.container).run({ input: approve });
    expect(f.native.createMembers).not.toHaveBeenCalled();
    expect(f.state().metadata.member_id).toBe("mem_reused");
  });
  it("compensates new native records when the final commit fails", async () => {
    const f = fixture({ failFinalize: true });
    await expect(mutateVendorApplicationWorkflow(f.container).run({ input: approve })).rejects.toMatchObject({ message: "finalize unavailable" });
    expect(f.state().metadata).toEqual({ customer_id: "cus_buyer", preference: "preserve" });
    expect(f.state().members).toEqual([]);
    expect(f.state().sellers).toEqual([]);
    expect(f.state().memberships).toEqual([]);
    expect(f.warehouse.locations).toEqual([]);
    expect(f.warehouse.claims[0].state).toBe("released");
    expect(f.state().app.status).toBe("submitted");
    expect(f.events).toEqual([]);
  });
  it("preserves a reused identity and member through compensation", async () => {
    const f = fixture({ reused: true, failFinalize: true });
    await expect(mutateVendorApplicationWorkflow(f.container).run({ input: approve })).rejects.toBeDefined();
    expect(f.native.deleteMembers).not.toHaveBeenCalled();
    expect(f.state().metadata.member_id).toBe("mem_reused");
    expect(f.state().members[0].metadata).toEqual({ original: true });
  });
  it.each([{ verified: false }, { foreignMember: true }, { reused: true, inactive: true }])("fails closed for invalid applicant/member state %j", async options => {
    const f = fixture(options);
    await expect(mutateVendorApplicationWorkflow(f.container).run({ input: approve })).rejects.toBeDefined();
    expect(f.native.createSellers).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
  });
  it("replays approval without provisioning twice and rejects payload reuse", async () => {
    const f = fixture();
    await mutateVendorApplicationWorkflow(f.container).run({ input: approve });
    await mutateVendorApplicationWorkflow(f.container).run({ input: approve });
    expect(f.native.createSellers).toHaveBeenCalledTimes(1);
    expect(f.warehouse.stock.createStockLocations).toHaveBeenCalledTimes(1);
    await expect(mutateVendorApplicationWorkflow(f.container).run({ input: { ...approve, body: { ...approve.body, expected_version: 99 } } })).rejects.toMatchObject({ code: "mutation_conflict" });
  });
  it("denies operational access when an open native seller has no committed application", async () => {
    const f = fixture();
    f.native.retrieveMember.mockResolvedValue({ id: "mem_one", email: "buyer@example.test", is_active: true, metadata: {} });
    f.native.listSellerMembers.mockResolvedValue([{ id: "sm_one", seller_id: "sel_one", member_id: "mem_one", role_id: SellerRole.SELLER_ADMINISTRATION, is_owner: true }]);
    f.native.retrieveSeller.mockResolvedValue({ id: "sel_one", status: "open", external_id: "vendor-application:vapp_one" });
    await expect(requireVendorAccess(f.container, "mem_one", "sel_one")).rejects.toMatchObject({ code: "application_not_approved" });
  });
});
