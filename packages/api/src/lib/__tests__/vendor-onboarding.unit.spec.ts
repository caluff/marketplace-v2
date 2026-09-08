import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer } from "@medusajs/framework/utils";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { SaveApplicationBodySchema, ReviewApplicationBodySchema, type DraftData } from "../vendor-onboarding/schemas";
import { canonicalHash, validateCompleteData, validateSubmission } from "../vendor-onboarding/validation";
import { loadApplicant, requireReviewer, requireVendorAccess } from "../vendor-onboarding/access";
import { guardInventoryScope, guardProductVisibility } from "../vendor-onboarding/native-guards";
import { onboardingHttp } from "../vendor-onboarding/http";
import { requestVendorApplicationVerificationWorkflow } from "../../workflows/vendor-application-notifications";

const draft: DraftData = {
  responsible: { first_name: "Jane", last_name: "Buyer", phone: "+12025550123" },
  store: { name: "Small Studio", handle: "small-studio", description: "Handmade pieces from our small studio.", website_url: "" },
  activity: { business_type: "individual", company_name: "", business_address: { address_1: "1 Main Street", address_2: "", city: "Washington", province: "DC", postal_code: "20001", country_code: "us" }, currency_code: "usd", category_ids: ["pcat_craft"], description: "Handmade home goods" },
};
const save = { mutation_id: "90885306-3217-46ab-8cef-fcf0ac647f8d", expected_version: 0, current_step: "responsible", data: draft };

describe("vendor application contracts and eligibility", () => {
  it("allows incomplete drafts while submission requires complete fields", () => {
    const incomplete = { ...draft, responsible: { ...draft.responsible, first_name: "" } };
    expect(SaveApplicationBodySchema.safeParse({ ...save, data: incomplete }).success).toBe(true);
    expect(() => validateCompleteData(incomplete)).toThrow();
  });
  it.each(["customer_id", "auth_identity_id", "seller_id", "member_id", "status", "reviewer_id", "role_id"])("rejects client ownership/status property %s", key => {
    expect(SaveApplicationBodySchema.safeParse({ ...save, [key]: "injected" }).success).toBe(false);
  });
  it("rejects sensitive business fields and non-UUID mutations", () => {
    expect(SaveApplicationBodySchema.safeParse({ ...save, data: { ...draft, activity: { ...draft.activity, tax_id: "sensitive" } } }).success).toBe(false);
    expect(SaveApplicationBodySchema.safeParse({ ...save, mutation_id: "retry" }).success).toBe(false);
  });
  it.each(["javascript:alert(1)", "https://user:password@example.test", "file:///local"])("rejects unsafe website %s", website_url => {
    expect(SaveApplicationBodySchema.safeParse({ ...save, data: { ...draft, store: { ...draft.store, website_url } } }).success).toBe(false);
  });
  it("rejects controls and duplicate category IDs", () => {
    expect(SaveApplicationBodySchema.safeParse({ ...save, data: { ...draft, store: { ...draft.store, name: "name\nheader" } } }).success).toBe(false);
    expect(SaveApplicationBodySchema.safeParse({ ...save, data: { ...draft, activity: { ...draft.activity, category_ids: ["id", "id"] } } }).success).toBe(false);
  });
  it("enforces individual/company and US address requirements", () => {
    expect(validateCompleteData(draft)).toEqual(draft);
    expect(() => validateCompleteData({ ...draft, activity: { ...draft.activity, business_type: "company" } })).toThrow();
    expect(() => validateCompleteData({ ...draft, activity: { ...draft.activity, company_name: "Company" } })).toThrow();
    expect(validateCompleteData({ ...draft, activity: { ...draft.activity, business_type: "company", company_name: "Company" } }).activity.company_name).toBe("Company");
    for (const address of [{ country_code: "uy" }, { province: "XX" }, { postal_code: "ABC" }]) expect(() => validateCompleteData({ ...draft, activity: { ...draft.activity, business_address: { ...draft.activity.business_address, ...address } } })).toThrow();
  });
  it("requires public reasons for negative decisions and forbids reason on approval", () => {
    const common = { mutation_id: save.mutation_id, expected_version: 1 };
    expect(ReviewApplicationBodySchema.safeParse({ ...common, decision: "reject" }).success).toBe(false);
    expect(ReviewApplicationBodySchema.safeParse({ ...common, decision: "request_changes", reason: "  " }).success).toBe(false);
    expect(ReviewApplicationBodySchema.safeParse({ ...common, decision: "approve", reason: "anything" }).success).toBe(false);
  });
  it("normalizes lowercase US state codes from customer addresses without changing the saved draft", () => {
    const saved = { ...draft, activity: { ...draft.activity, business_address: { ...draft.activity.business_address, province: "fl" } } };
    expect(validateCompleteData(saved).activity.business_address.province).toBe("FL");
    expect(saved.activity.business_address.province).toBe("fl");
  });
  it("accepts a trimmed category proposal instead of existing categories while retaining old drafts", () => {
    expect(validateCompleteData(draft)).toEqual(draft);
    const suggested = { ...draft, activity: { ...draft.activity, category_ids: [], category_suggestion: "  Ceramic instruments  " } };
    expect(validateCompleteData(suggested).activity.category_suggestion).toBe("Ceramic instruments");
    for (const category_suggestion of [undefined, "", "   "]) {
      expect(() => validateCompleteData({ ...suggested, activity: { ...suggested.activity, category_suggestion } })).toThrow();
    }
  });
  it.each(["a".repeat(121), "Pottery\nHeader", "Pottery\u0000"])("rejects an oversized or multiline category proposal", category_suggestion => {
    expect(SaveApplicationBodySchema.safeParse({ ...save, data: { ...draft, activity: { ...draft.activity, category_suggestion } } }).success).toBe(false);
  });
  it("canonicalizes object ordering without treating changed arrays as replays", () => {
    expect(canonicalHash({ a: 1, b: [2, 3] })).toBe(canonicalHash({ b: [2, 3], a: 1 }));
    expect(canonicalHash({ b: [3, 2], a: 1 })).not.toBe(canonicalHash({ a: 1, b: [2, 3] }));
  });
});

describe("vendor category proposal submission", () => {
  function fixture() {
    const container = createMedusaContainer();
    const graph = jest.fn(async ({ entity }) => ({ data: entity === "store" ? [{ supported_currencies: [{ currency_code: "usd" }] }] : [{ id: "pcat_craft" }] }));
    const listSellers = jest.fn(async () => []);
    container.register({ query: asValue({ graph }), seller: asValue({ listSellers }) });
    return { container, graph, listSellers };
  }
  it("allows proposal-only submissions without a category lookup or category creation", async () => {
    const f = fixture();
    const proposal = { ...draft, activity: { ...draft.activity, category_ids: [], category_suggestion: "Ceramic instruments" } };
    expect(await validateSubmission(f.container, proposal, "buyer@example.test")).toEqual(proposal);
    expect(f.graph).toHaveBeenCalledTimes(1);
    expect(f.graph.mock.calls[0][0].entity).toBe("store");
    expect(f.listSellers).toHaveBeenCalledTimes(3);
  });
  it("still rejects unavailable existing category IDs when a proposal is present", async () => {
    const f = fixture();
    const proposal = { ...draft, activity: { ...draft.activity, category_ids: ["pcat_craft", "pcat_missing"], category_suggestion: "Ceramic instruments" } };
    await expect(validateSubmission(f.container, proposal, "buyer@example.test")).rejects.toMatchObject({ code: "invalid_categories" });
    expect(f.graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "product_category", filters: { id: proposal.activity.category_ids, is_active: true, is_internal: false } }), { cache: { enable: false } });
    expect(f.listSellers).not.toHaveBeenCalled();
  });
});

function accessFixture() {
  const container = createMedusaContainer();
  const auth = { retrieveAuthIdentity: jest.fn(async () => ({ id: "auth_one", app_metadata: { customer_id: "cus_one" }, provider_identities: [{ provider: "emailpass", entity_id: "buyer@example.test" }] })), listAuthVerifications: jest.fn(async () => []), requestAuthVerification: jest.fn() };
  const graph = jest.fn(async () => ({ data: [{ id: "cus_one", email: "buyer@example.test", has_account: true }] as unknown[] }));
  container.register({ auth: asValue(auth), query: asValue({ graph }), seller: asValue({ listSellerMembers: jest.fn(async () => []) }), rbac: asValue({ listPoliciesForRole: jest.fn(async () => []) }), logger: asValue({ error: jest.fn() }) });
  return { container, auth, graph };
}
describe("live applicant authorization", () => {
  it("rejects an actor mismatch without returning the parallel customer read or continuing verification", async () => {
    const f = accessFixture();
    await expect(loadApplicant(f.container, { customer_id: "cus_foreign", auth_identity_id: "auth_one" })).rejects.toMatchObject({ code: "identity_changed" });
    expect(f.graph).toHaveBeenCalledTimes(1);
    expect(f.auth.listAuthVerifications).not.toHaveBeenCalled();
  });
  it("checks the exact auth identity, provider email and entity type", async () => {
    const f = accessFixture();
    const live = await loadApplicant(f.container, { customer_id: "cus_one", auth_identity_id: "auth_one" });
    expect(live.emailVerified).toBe(false);
    expect(f.auth.listAuthVerifications).toHaveBeenCalledWith({ auth_identity_id: "auth_one", entity_id: "buyer@example.test", entity_type: "email" });
  });
  it("rejects a guest customer and mismatched provider email", async () => {
    const f = accessFixture();
    for (const customer of [{ id: "cus_one", email: "buyer@example.test", has_account: false }, { id: "cus_one", email: "other@example.test", has_account: true }]) {
      f.graph.mockResolvedValue({ data: [customer] });
      await expect(loadApplicant(f.container, { customer_id: "cus_one", auth_identity_id: "auth_one" })).rejects.toMatchObject({ code: "identity_changed" });
    }
  });
  it("denies an admin without live roles instead of relying on JWT role hints", async () => {
    const f = accessFixture();
    f.graph.mockResolvedValue({ data: [{ id: "user_one", rbac_roles: [] }] });
    await expect(requireReviewer(f.container, "user_one", "update")).rejects.toMatchObject({ code: "review_forbidden" });
  });
  it("does not request verification when a real delivery provider is unavailable", async () => {
    const f = accessFixture();
    const previous = process.env.AUTH_EMAIL_ENABLED;
    process.env.AUTH_EMAIL_ENABLED = "false";
    try {
      await expect(requestVendorApplicationVerificationWorkflow(f.container).run({ input: { applicant: { customer_id: "cus_one", auth_identity_id: "auth_one" }, ip: "127.0.0.1" } })).rejects.toMatchObject({ code: "email_service_unconfigured" });
      expect(f.auth.requestAuthVerification).not.toHaveBeenCalled();
    } finally { if (previous === undefined) delete process.env.AUTH_EMAIL_ENABLED; else process.env.AUTH_EMAIL_ENABLED = previous; }
  });
});

describe("native route isolation", () => {
  it.each(["/vendor/products/foreign", "/vendor/products/foreign/preview", "/vendor/products/foreign/variants", "/vendor/products/foreign/variants/variant_one", "/vendor/products/foreign/catalog-options", "/vendor/products/foreign/attributes/batch"])("blocks foreign draft read and write through %s", async originalUrl => {
    const container = createMedusaContainer();
    container.register({ query: asValue({ graph: jest.fn(async ({ entity }) => ({ data: entity === "product" ? [{ id: "foreign", status: "draft" }] : [] })) }) });
    for (const method of ["GET", "POST", "DELETE"]) await expect(guardProductVisibility({ originalUrl, method, scope: container } as MedusaRequest, "sel_one")).rejects.toMatchObject({ code: "product_not_found" });
  });
  it("rejects a foreign location even when the inventory item belongs to the seller", async () => {
    const container = createMedusaContainer();
    container.register({ query: asValue({ graph: jest.fn(async ({ entity }) => ({ data: entity === "inventory_item_seller" ? [{ inventory_item_id: "item_own" }] : [] })) }) });
    await expect(guardInventoryScope({ originalUrl: "/vendor/inventory-items/item_own/location-levels/loc_foreign", method: "POST", body: { stocked_quantity: 10 }, scope: container } as MedusaRequest, "sel_one")).rejects.toMatchObject({ code: "inventory_scope_forbidden" });
  });
  it("rejects inactive members before looking at cached memberships", async () => {
    const container = createMedusaContainer();
    const membership = jest.fn();
    container.register({ seller: asValue({ retrieveMember: jest.fn(async () => ({ is_active: false })), listSellerMembers: membership }) });
    await expect(requireVendorAccess(container, "mem_one", "sel_one")).rejects.toMatchObject({ code: "member_inactive" });
    expect(membership).not.toHaveBeenCalled();
  });
  it("preserves feature HTTP status for serialized workflow errors without leaking internals", async () => {
    const res = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    await onboardingHttp(res as unknown as MedusaResponse, async () => { throw { code: "verification_required", message: "private diagnostic" }; });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ type: "not_allowed", code: "verification_required", message: "verification_required" });
  });
});
