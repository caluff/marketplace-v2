import type { AuthContext } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ChangeActionType, ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createOrderTrackingToken } from "../access";
import { authorizeOrderTrackingClaim, prepareOrderTrackingClaim, readOrderTrackingTransferToken, resolveOrderTrackingClaimLock } from "../claim";

const graph = jest.fn();
const retrieveAuthIdentity = jest.fn();
const container = {
  resolve(key: string) {
    if (key === Modules.AUTH) return { retrieveAuthIdentity };
    if (key === ContainerRegistrationKeys.QUERY) return { graph };
    throw new Error(`Unexpected test service: ${key}`);
  },
} as unknown as MedusaContainer;
const context: AuthContext = {
  actor_type: "customer", actor_id: "cus_account", auth_identity_id: "auth_test", auth_provider: "google",
  app_metadata: { customer_id: "cus_account" }, user_metadata: {},
};
const customer = { id: "cus_account", email: "buyer@example.test", has_account: true };
const order = {
  id: "order_ClaimTest", email: "buyer@example.test", customer_id: "cus_guest", status: "pending", is_draft_order: false,
  customer: { id: "cus_guest", has_account: false },
};
const identity = {
  id: "auth_test", app_metadata: { customer_id: customer.id },
  provider_identities: [{ provider: "google", entity_id: "google-subject", user_metadata: { email: customer.email } }],
};
const oldSecret = process.env.JWT_SECRET;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = "order-claim-test-secret-32-characters";
  retrieveAuthIdentity.mockResolvedValue(identity);
  graph.mockImplementation(async (input: { entity: string }) => ({ data: [input.entity === "customer" ? customer : order] }));
});

afterAll(() => {
  if (oldSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = oldSecret;
});

function prepared() {
  return prepareOrderTrackingClaim(createOrderTrackingToken(order), context);
}

it("shares only the originating cart lock and gives separate claims independent stable owners", async () => {
  graph.mockResolvedValue({ data: [{ cart_id: "cart_origin" }] });
  const first = await resolveOrderTrackingClaimLock(container, prepared());
  const second = await resolveOrderTrackingClaimLock(container, prepared());
  expect(first).toMatchObject({ order_id: order.id, cart_keys: ["cart_origin"] });
  expect(first.owner_id).not.toBe(second.owner_id);
  expect(graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "order_cart", filters: { order_id: order.id } }), { cache: { enable: false } });
  graph.mockResolvedValue({ data: [] });
  await expect(resolveOrderTrackingClaimLock(container, prepared())).resolves.toMatchObject({ order_id: order.id, cart_keys: [] });
  graph.mockResolvedValue({ data: [{ cart_id: "cart_one" }, { cart_id: "cart_other" }] });
  await expect(resolveOrderTrackingClaimLock(container, prepared())).rejects.toThrow("No pudimos asociar");
});

it("requires a completed Google customer context and valid private token before database reads", () => {
  for (const auth_context of [
    { ...context, actor_type: "user" }, { ...context, actor_id: "" },
    { ...context, auth_identity_id: "" }, { ...context, auth_provider: "emailpass" },
  ]) expect(() => prepareOrderTrackingClaim(createOrderTrackingToken(order), auth_context)).toThrow("Inicia sesión");
  for (const token of ["invalid", createOrderTrackingToken(order, process.env, Date.now() - 91 * 24 * 60 * 60 * 1000)]) {
    expect(() => prepareOrderTrackingClaim(token, context)).toThrow("no es válido");
  }
  expect(graph).not.toHaveBeenCalled();
  expect(retrieveAuthIdentity).not.toHaveBeenCalled();
});

it("authorizes only the signed order and the live Google customer, without leaking personal data", async () => {
  const result = await authorizeOrderTrackingClaim(container, prepared());
  expect(result).toMatchObject({ order_id: order.id, customer_id: customer.id, already_owned: false });
  expect(graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "customer", filters: { id: context.actor_id } }), { cache: { enable: false } });
  expect(graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "order", filters: { id: order.id } }), { cache: { enable: false } });
  expect(result).not.toHaveProperty("email");
});

it("normalizes email but never treats a different Google address as order ownership", async () => {
  retrieveAuthIdentity.mockResolvedValue({ ...identity, provider_identities: [{ ...identity.provider_identities[0], user_metadata: { email: " Buyer@Example.Test " } }] });
  await expect(authorizeOrderTrackingClaim(container, prepared())).resolves.toMatchObject({ already_owned: false });
  retrieveAuthIdentity.mockResolvedValue({ ...identity, provider_identities: [{ ...identity.provider_identities[0], user_metadata: { email: "other@example.test" } }] });
  await expect(authorizeOrderTrackingClaim(container, prepared())).rejects.toThrow("Inicia sesión");
});

it("rejects changed identity bindings, missing Google identities and inactive customer accounts", async () => {
  for (const authIdentity of [
    { ...identity, app_metadata: { customer_id: "cus_other" } },
    { ...identity, provider_identities: [] },
    { ...identity, provider_identities: [{ ...identity.provider_identities[0], entity_id: "" }] },
  ]) {
    retrieveAuthIdentity.mockResolvedValue(authIdentity);
    await expect(authorizeOrderTrackingClaim(container, prepared())).rejects.toThrow("Inicia sesión");
  }
  retrieveAuthIdentity.mockResolvedValue(identity);
  graph.mockResolvedValue({ data: [{ ...customer, has_account: false }] });
  await expect(authorizeOrderTrackingClaim(container, prepared())).rejects.toThrow("Inicia sesión");
});

it("does not allow a different recipient even if their Google customer is valid", async () => {
  const otherCustomer = { ...customer, email: "other@example.test" };
  retrieveAuthIdentity.mockResolvedValue({ ...identity, provider_identities: [{ ...identity.provider_identities[0], user_metadata: { email: otherCustomer.email } }] });
  graph.mockResolvedValue({ data: [otherCustomer] });
  await expect(authorizeOrderTrackingClaim(container, prepared())).rejects.toThrow("no es válido");
  expect(graph).toHaveBeenCalledTimes(1);
});

it("rejects drafts, missing orders, changed recipients and expired links after lock acquisition", async () => {
  const input = prepared();
  for (const orders of [[], [{ ...order, is_draft_order: true }], [{ ...order, email: "changed@example.test" }]]) {
    graph.mockImplementation(async (request: { entity: string }) => ({ data: request.entity === "customer" ? [customer] : orders }));
    await expect(authorizeOrderTrackingClaim(container, input)).rejects.toThrow("no es válido");
  }
  await expect(authorizeOrderTrackingClaim(container, { ...input, claims: { ...input.claims, exp: 1 } })).rejects.toThrow("no es válido");
});

it("does not reassign another registered owner or infer guest status from a missing customer link", async () => {
  for (const changed of [
    { ...order, customer: { id: "cus_guest", has_account: true } },
    { ...order, customer: null },
    { ...order, customer: { id: "cus_wrong_link", has_account: false } },
    { ...order, status: "canceled" },
  ]) {
    graph.mockImplementation(async (input: { entity: string }) => ({ data: [input.entity === "customer" ? customer : changed] }));
    await expect(authorizeOrderTrackingClaim(container, prepared())).rejects.toThrow("No pudimos asociar");
  }
});

it("returns an existing association idempotently without requiring a new native transfer", async () => {
  graph.mockImplementation(async (input: { entity: string }) => ({ data: [input.entity === "customer" ? customer : { ...order, customer_id: customer.id, status: "canceled" }] }));
  await expect(authorizeOrderTrackingClaim(container, prepared())).resolves.toMatchObject({ order_id: order.id, customer_id: customer.id, already_owned: true });
});

it("accepts a genuinely unassigned order without promoting or querying other guest orders", async () => {
  graph.mockImplementation(async (input: { entity: string }) => ({ data: [input.entity === "customer" ? customer : { ...order, customer_id: null, customer: null }] }));
  await expect(authorizeOrderTrackingClaim(container, prepared())).resolves.toMatchObject({ already_owned: false });
  expect(graph).toHaveBeenCalledTimes(2);
});

it("uses only the native transfer request created for this customer and order", async () => {
  const claim = { order_id: order.id, customer_id: customer.id, already_owned: false,
    source_customer_id: order.customer_id, recipient: prepared().claims.recipient,
  };
  const change = { id: "ordch_test", change_type: "transfer", created_by: customer.id,
    actions: [{ action: ChangeActionType.TRANSFER_CUSTOMER, reference_id: customer.id, details: { token: "native-private-token" } }],
  };
  graph.mockImplementation(async (input: { entity: string }) => ({ data: [input.entity === "order" ? order : change] }));
  await expect(readOrderTrackingTransferToken(container, claim)).resolves.toBe("native-private-token");
  for (const changes of [
    [], [change, change], [{ ...change, change_type: "edit" }], [{ ...change, created_by: "cus_other" }],
    [{ ...change, actions: [{ ...change.actions[0], reference_id: "cus_other" }] }],
    [{ ...change, actions: [{ ...change.actions[0], details: {} }] }],
  ]) {
    graph.mockImplementation(async (input: { entity: string }) => ({ data: input.entity === "order" ? [order] : changes }));
    await expect(readOrderTrackingTransferToken(container, claim)).rejects.toThrow("No pudimos asociar");
  }
});

it("rechecks the live guest owner and recipient before accepting the native transfer", async () => {
  const claim = { order_id: order.id, customer_id: customer.id, already_owned: false,
    source_customer_id: order.customer_id, recipient: prepared().claims.recipient,
  };
  for (const changed of [
    { ...order, customer_id: "cus_transferred_elsewhere" },
    { ...order, customer: { id: order.customer_id, has_account: true } },
    { ...order, customer: null },
    { ...order, status: "canceled" },
    { ...order, is_draft_order: true },
  ]) {
    graph.mockResolvedValue({ data: [changed] });
    await expect(readOrderTrackingTransferToken(container, claim)).rejects.toThrow("No pudimos asociar");
  }
  graph.mockResolvedValue({ data: [{ ...order, email: "changed@example.test" }] });
  await expect(readOrderTrackingTransferToken(container, claim)).rejects.toThrow("no es válido");
  expect(graph.mock.calls.every(([input]) => input.entity === "order")).toBe(true);
});
