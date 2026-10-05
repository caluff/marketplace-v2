/**
 * Opt in with CATALOG_PERMISSION_TESTS=disposable-local after importing the
 * isolated integration environment. The native runner owns and drops its UUID
 * localhost database/template and uses a dedicated TLS Redis DB15. Real HTTP,
 * auth, RBAC, Mercur moderation/actions and PostgreSQL remain enabled; outbound
 * providers and automatic financial jobs remain disabled. Catalog image rows
 * below are ownership fixtures, not uploads to any external storage service.
 */
import { randomUUID } from "node:crypto";
import { Client } from "@medusajs/framework/pg";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules, PolicyOperation } from "@medusajs/framework/utils";
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createRbacPoliciesWorkflow, createRbacRolesWorkflow, createUsersWorkflow, updateStoresWorkflow } from "@medusajs/core-flows";
import { approveSellerWorkflow, createProductsWorkflow, createSellerAccountWorkflow } from "@mercurjs/core/workflows";
import { AttributeType, MercurModules, ProductStatus } from "@mercurjs/types";
import type SellerModule from "@mercurjs/core/modules/seller";
import { CATALOG_MEDIA_MODULE } from "../../src/modules/catalog-media";
import type CatalogMediaService from "../../src/modules/catalog-media/service";

const createCatalogPermissionImageFixtureStep = createStep(
  "catalog-permission-test-image-fixture",
  async (input: { sellerId: string; memberId: string }, { container }) => {
    const image = await container.resolve<CatalogMediaService>(CATALOG_MEDIA_MODULE).createCatalogImages({
      seller_id: input.sellerId,
      member_id: input.memberId,
      file_id: `disposable-${randomUUID()}`,
      url: `http://localhost:1/disposable-catalog-${randomUUID()}.jpg`,
    });
    return new StepResponse(image, image.id);
  },
  async (id, { container }) => {
    if (id) await container.resolve<CatalogMediaService>(CATALOG_MEDIA_MODULE).deleteCatalogImages(id);
  },
);
const createCatalogPermissionImageFixtureWorkflow = createWorkflow(
  "catalog-permission-test-image-fixture",
  function (input: { sellerId: string; memberId: string }) {
    return new WorkflowResponse(createCatalogPermissionImageFixtureStep(input));
  },
);

const enabled = process.env.CATALOG_PERMISSION_TESTS === "disposable-local";
if (!enabled) {
  describe.skip("Catalog permissions integration (requires disposable-local opt-in)", () => {
    it("requires disposable PostgreSQL and dedicated TLS Redis; see file header", () => {});
  });
} else {
  if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" ||
      process.env.DB_PORT !== "55432" || process.env.DB_USERNAME !== "closure_test" ||
      !process.env.DB_PASSWORD || process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) {
    throw new Error("Catalog permission coverage requires explicit disposable localhost PostgreSQL credentials.");
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (redis.protocol !== "rediss:" || redis.hostname !== "localhost" || redis.port !== "56379" ||
      redis.username !== "closure" || !redis.password || redis.pathname !== "/15") {
    throw new Error("Catalog permission coverage requires dedicated localhost TLS Redis DB15.");
  }
  const dbName = `closure_catalog_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:55432/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  jest.setTimeout(180_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async container => {
        const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
        const database = new URL(config.projectConfig.databaseUrl!);
        if (database.hostname !== "localhost" || database.port !== "55432" ||
            database.pathname !== `/${dbName}` || config.projectConfig.redisUrl !== process.env.REDIS_URL) {
          throw new Error("Refusing catalog permission coverage against any other database or Redis.");
        }
        const notification = config.modules?.[Modules.NOTIFICATION];
        if (notification && typeof notification === "object" && "options" in notification) {
          const providers = notification.options?.providers;
          if (Array.isArray(providers) && providers.some((provider: { resolve?: unknown }) =>
            typeof provider.resolve !== "string" || !/(notification-local|notification-mock)$/.test(provider.resolve))) {
            throw new Error("Disposable catalog coverage allows only local/mock notifications.");
          }
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      type Actor = { token: string; sellerId?: string; memberId?: string; userId?: string };
      type Vendor = Actor & { sellerId: string; memberId: string };
      type NativeSellerService = InstanceType<typeof SellerModule.service>;
      const auth = () => getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      const nativeSellers = () => getContainer().resolve<NativeSellerService>(MercurModules.SELLER);
      const request = (method: "GET" | "POST" | "DELETE", url: string, actor?: Actor, data?: object) => api.request({
        method, url, data,
        headers: { ...(actor ? { authorization: `Bearer ${actor.token}` } : {}), ...(actor?.sellerId ? { "x-seller-id": actor.sellerId } : {}) },
        validateStatus: () => true,
      });
      async function identity() {
        const email = `catalog-${randomUUID()}@example.invalid`;
        const password = `Disposable-${randomUUID()}!`;
        const registered = await auth().register("emailpass", { body: { email, password } });
        if (!registered.success || !registered.authIdentity) throw new Error("Native disposable identity registration failed.");
        const id = registered.authIdentity.id;
        const verification = await auth().requestAuthVerification({ auth_identity_id: id, entity_id: email, entity_type: "email", code_provider: "token" });
        if (!verification.code) throw new Error("Native disposable identity verification returned no code.");
        await auth().confirmAuthVerification({ code: verification.code, auth_identity_id: id });
        return { id, email, password };
      }
      async function login(actor: "user" | "member", account: Awaited<ReturnType<typeof identity>>) {
        const response = await request("POST", `/auth/${actor}/emailpass`, undefined, { email: account.email, password: account.password });
        expect(response.status).toBe(200);
        expect(response.data.token).toEqual(expect.any(String));
        return response.data.token as string;
      }
      async function operator(readOnly = false): Promise<Actor & { userId: string }> {
        const account = await identity();
        const operations = readOnly ? [PolicyOperation.read] : [PolicyOperation.read, PolicyOperation.create, PolicyOperation.update, PolicyOperation.delete];
        const rbac = getContainer().resolve(Modules.RBAC);
        const policyIds: string[] = [];
        for (const resource of ["seller", "product", "product_change"]) {
          for (const operation of operations) {
            const existing = await rbac.listRbacPolicies({ resource, operation });
            if (existing.length) policyIds.push(...existing.map(policy => policy.id));
            else {
              const { result } = await createRbacPoliciesWorkflow(getContainer()).run({ input: { policies: [{ resource, operation }] } });
              policyIds.push(...result.map(policy => policy.id));
            }
          }
        }
        const { result: roles } = await createRbacRolesWorkflow(getContainer()).run({ input: { roles: [{ name: `catalog-${randomUUID()}`, policy_ids: policyIds }] } });
        const { result: users } = await createUsersWorkflow(getContainer()).run({ input: { users: [{ email: account.email, roles: [roles[0].id] }] } });
        await auth().updateAuthIdentities({ id: account.id, app_metadata: { user_id: users[0].id } });
        return { userId: users[0].id, token: await login("user", account) };
      }
      async function vendor(): Promise<Vendor> {
        const account = await identity();
        const { result: seller } = await createSellerAccountWorkflow(getContainer()).run({ input: {
          auth_identity_id: account.id, member_email: account.email,
          seller: { name: `Disposable catalog ${randomUUID()}`, handle: `catalog-${randomUUID()}`, email: account.email, currency_code: "usd" },
        } });
        await approveSellerWorkflow(getContainer()).run({ input: { seller_id: seller.id } });
        const memberId = (await auth().retrieveAuthIdentity(account.id)).app_metadata?.member_id;
        if (typeof memberId !== "string") throw new Error("Native seller member binding is missing.");
        return { sellerId: seller.id, memberId, token: await login("member", account) };
      }
      async function permission(admin: Actor, owner: Vendor, mode: "supervised" | "authorized") {
        const response = await request("POST", `/admin/sellers/${owner.sellerId}/catalog-permission`, admin, { mode });
        expect(response.status).toBe(200);
        expect(response.data.catalog_permission).toMatchObject({ seller_id: owner.sellerId, mode });
      }
      async function readPermission(admin: Actor, owner: Vendor) {
        const response = await request("GET", `/admin/catalog-permissions?seller_ids[]=${owner.sellerId}`, admin);
        expect(response.status).toBe(200);
        expect(response.data.catalog_permissions).toEqual([expect.objectContaining({ seller_id: owner.sellerId, mode: expect.any(String) })]);
        return response.data.catalog_permissions[0].mode as string;
      }
      function productInput(title = `Catalog product ${randomUUID()}`) {
        return { title, status: "proposed", attributes: [], variants: [{ title: "One", sku: `catalog-${randomUUID()}`, options: {} }] };
      }
      async function createProduct(owner: Vendor, body: object = productInput()) {
        const response = await request("POST", "/vendor/products", owner, body);
        expect(response.status).toBe(201);
        expect(response.data.product.id).toEqual(expect.any(String));
        return response.data.product;
      }
      async function readProduct(owner: Vendor, productId: string) {
        const response = await request("GET", `/vendor/products/${productId}`, owner);
        expect(response.status).toBe(200);
        return response.data.product;
      }
      async function persistedProduct(productId: string) {
        const client = new Client({ host: "localhost", port: 55432, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: dbName });
        await client.connect();
        try {
          await client.query("BEGIN READ ONLY");
          const product = (await client.query("SELECT id, title, status, thumbnail FROM product WHERE id = $1 AND deleted_at IS NULL", [productId])).rows[0];
          const changes = (await client.query("SELECT id, status, created_by, confirmed_by, confirmed_at FROM product_change WHERE product_id = $1 AND deleted_at IS NULL ORDER BY created_at, id", [productId])).rows;
          const actions = (await client.query("SELECT id, product_change_id, action, details FROM product_change_action WHERE product_id = $1 AND deleted_at IS NULL ORDER BY created_at, id", [productId])).rows;
          await client.query("COMMIT");
          return { product, changes, actions };
        } finally { await client.end(); }
      }
      async function persistedPermission(sellerId: string) {
        const client = new Client({ host: "localhost", port: 55432, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: dbName });
        await client.connect();
        try {
          await client.query("BEGIN READ ONLY");
          const tables = await client.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.seller_catalog_permission'::regclass");
          expect(tables.rows).toEqual([{ relrowsecurity: true }]);
          const publicGrants = await client.query(`SELECT permission.privilege_type FROM pg_class relation
            CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) permission
            LEFT JOIN pg_roles actor ON actor.oid = permission.grantee
            WHERE relation.oid = 'public.seller_catalog_permission'::regclass
              AND (permission.grantee = 0 OR actor.rolname IN ('anon', 'authenticated'))`);
          expect(publicGrants.rows).toHaveLength(0);
          const records = await client.query("SELECT seller_id, mode, changed_by FROM seller_catalog_permission WHERE seller_id = $1 AND deleted_at IS NULL", [sellerId]);
          await client.query("COMMIT");
          return records.rows;
        } finally { await client.end(); }
      }
      async function confirmedChange(owner: Vendor, method: "POST" | "DELETE", url: string, body?: object) {
        const response = await request(method, url, owner, body);
        expect(response.status).toBe(202);
        expect(response.data.product_change).toMatchObject({ id: expect.any(String), status: "confirmed", created_by: owner.sellerId, confirmed_by: expect.any(String) });
        expect(response.data.product_change.actions.length).toBeGreaterThan(0);
        return response.data.product_change;
      }
      beforeEach(async () => {
        const { data: stores } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "store", fields: ["id"] });
        await updateStoresWorkflow(getContainer()).run({ input: { selector: { id: stores[0].id }, update: { supported_currencies: [{ currency_code: "usd", is_default: true }] } } });
      });

      it("requires seller.update on an admin and ignores vendor metadata when deciding catalogue authority", async () => {
        const writer = await operator();
        const reader = await operator(true);
        const owner = await vendor();
        expect(await readPermission(reader, owner)).toBe("supervised");
        expect(await persistedPermission(owner.sellerId)).toEqual([]);
        const route = `/admin/sellers/${owner.sellerId}/catalog-permission`;
        expect((await request("POST", route, undefined, { mode: "authorized" })).status).toBe(401);
        expect((await request("POST", route, owner, { mode: "authorized" })).status).toBe(401);
        expect((await request("POST", route, reader, { mode: "authorized" })).status).toBe(403);
        expect((await request("POST", route, writer, { mode: "owner" })).status).toBe(400);
        expect((await request("POST", route, writer, { mode: "authorized", seller_id: "sel_forged" })).status).toBe(400);
        expect((await request("POST", "/admin/sellers/sel_missing_catalog_fixture/catalog-permission", writer, { mode: "authorized" })).status).toBe(404);
        const forged = await request("POST", `/vendor/sellers/${owner.sellerId}`, owner, { metadata: { catalog_review_mode: "authorized", catalog_permission: "authorized", fixture_note: "ordinary profile metadata" } });
        expect(forged.status).toBe(200);
        expect(await readPermission(reader, owner)).toBe("supervised");
        expect((await createProduct(owner)).status).toBe("proposed");
        await permission(writer, owner, "authorized");
        expect(await readPermission(reader, owner)).toBe("authorized");
        expect(await persistedPermission(owner.sellerId)).toEqual([{ seller_id: owner.sellerId, mode: "authorized", changed_by: writer.userId }]);
        const profile = await nativeSellers().retrieveSeller(owner.sellerId);
        expect(profile.metadata).toMatchObject({ fixture_note: "ordinary profile metadata" });
      });

      it("preserves supervised proposal, pending changes and existing catalogue validation", async () => {
        const owner = await vendor();
        const product = await createProduct(owner);
        expect(product.status).toBe("proposed");
        const updated = await request("POST", `/vendor/products/${product.id}`, owner, { title: "Pending supervised title" });
        expect(updated.status).toBe(202);
        expect(updated.data.product_change).toMatchObject({ status: "pending", created_by: owner.sellerId, confirmed_at: null });
        const stored = await persistedProduct(product.id);
        expect(stored.product.title).toBe(product.title);
        expect(stored.product.status).toBe("proposed");
        expect(stored.changes.filter(change => change.status === "pending")).toHaveLength(1);
        expect((await request("POST", "/vendor/products", owner, { ...productInput(), status: "published" })).status).toBe(400);
        expect((await request("POST", "/vendor/products", owner, { ...productInput(), categories: [{ id: "pcat_missing_catalog_fixture" }] })).status).toBe(400);
        const foreignImage = await request("POST", "/vendor/products", owner, { ...productInput(), thumbnail: "https://example.invalid/foreign-image.jpg" });
        expect(foreignImage.status).toBe(400);
        expect(foreignImage.data).toMatchObject({ type: "not_allowed", message: "Catalog image access is not permitted." });
      });

      it("publishes authorized additions and applies edits with native change actions and audit", async () => {
        const writer = await operator();
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner);
        expect(product.status).toBe("published");
        const initial = await persistedProduct(product.id);
        expect(initial.product.status).toBe("published");
        expect(initial.actions.map(action => action.action)).toContain("PRODUCT_ADD");
        expect(initial.actions.map(action => action.action)).toContain("STATUS_CHANGE");
        expect(initial.changes.every(change => change.status === "confirmed" && change.confirmed_at)).toBe(true);
        const edit = await confirmedChange(owner, "POST", `/vendor/products/${product.id}`, { title: "Authorized title", description: "Immediate authorized description" });
        expect(edit.actions.map((action: { action: string }) => action.action)).toEqual(expect.arrayContaining(["UPDATE"]));
        const after = await persistedProduct(product.id);
        expect(after.product.title).toBe("Authorized title");
        expect(after.product.status).toBe("published");
        expect(after.changes.filter(change => change.id === edit.id)).toHaveLength(1);
        expect(after.changes.every(change => change.status === "confirmed")).toBe(true);
        expect((await readProduct(owner, product.id)).description).toBe("Immediate authorized description");
      });

      it("allows product.update operators to edit, withdraw and republish without bypassing version checks", async () => {
        const writer = await operator();
        const reader = await operator(true);
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner);
        const url = `/admin/catalog-products/${product.id}/manage`;
        const initial = (await request("GET", `/admin/products/${product.id}`, writer)).data.product;
        const withdrawal = { action: "withdraw", expected_updated_at: initial.updated_at };
        expect((await request("POST", url, undefined, withdrawal)).status).toBe(401);
        expect((await request("POST", url, owner, withdrawal)).status).toBe(401);
        expect((await request("POST", url, reader, withdrawal)).status).toBe(403);
        expect((await request("POST", url, writer, { ...withdrawal, status: "draft" })).status).toBe(400);

        const content = { title: "Operator edited content", subtitle: null, description: "Operator description" };
        const edited = await request("POST", url, writer, {
          action: "update-content", expected_updated_at: initial.updated_at, content,
        });
        expect(edited.status).toBe(200);
        expect(edited.data.product).toMatchObject({ id: product.id, status: "published", ...content });
        const stale = await request("POST", url, writer, withdrawal);
        expect(stale.status).toBe(409);
        expect(stale.data).toMatchObject({ code: "catalog_product_changed", message: "catalog_product_changed" });
        const withdrawn = await request("POST", url, writer, {
          action: "withdraw", expected_updated_at: edited.data.product.updated_at,
        });
        expect(withdrawn.status).toBe(200);
        expect(withdrawn.data.product).toMatchObject({ id: product.id, title: content.title, status: "draft" });
        expect((await persistedProduct(product.id)).product.status).toBe("draft");
        const published = await request("POST", url, writer, {
          action: "publish", expected_updated_at: withdrawn.data.product.updated_at,
        });
        expect(published.status).toBe(200);
        expect((await persistedProduct(product.id)).product).toMatchObject({ id: product.id, title: content.title, status: "published" });
        expect((await readProduct(owner, product.id)).description).toBe(content.description);
      });

      it("blocks operator management while seller changes are pending and preserves native cancellation", async () => {
        const writer = await operator();
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner);
        await permission(writer, owner, "supervised");
        const pending = await request("POST", `/vendor/products/${product.id}`, owner, { title: "Seller pending title" });
        expect(pending.status).toBe(202);
        const current = (await request("GET", `/admin/products/${product.id}`, writer)).data.product;
        const url = `/admin/catalog-products/${product.id}/manage`;
        for (const action of ["withdraw", "publish", "update-content"]) {
          const result = await request("POST", url, writer, {
            action, expected_updated_at: current.updated_at,
            ...(action === "update-content" ? { content: { title: "Operator title", subtitle: null, description: null } } : {}),
          });
          expect(result.status).toBe(409);
          expect(result.data).toMatchObject({ code: "catalog_pending_change" });
        }
        expect((await persistedProduct(product.id)).product).toMatchObject({ title: product.title, status: "published" });
        const cancelled = await request("POST", `/admin/product-changes/${pending.data.product_change.id}/cancel`, writer, {});
        expect(cancelled.status).toBe(200);
        expect(cancelled.data.product_change).toMatchObject({ id: pending.data.product_change.id, status: "canceled" });
        const fresh = (await request("GET", `/admin/products/${product.id}`, writer)).data.product;
        const withdrawal = await request("POST", url, writer, { action: "withdraw", expected_updated_at: fresh.updated_at });
        expect(withdrawal.status).toBe(200);
      });

      it("coordinates operator management with native confirmation without overwriting the reviewed seller content", async () => {
        const writer = await operator();
        const owner = await vendor();
        await permission(writer, owner, "authorized");
        const product = await createProduct(owner);
        await permission(writer, owner, "supervised");
        const before = (await request("GET", `/admin/products/${product.id}`, writer)).data.product;
        const pending = await request("POST", `/vendor/products/${product.id}`, owner, { title: "Reviewed seller content" });
        expect(pending.status).toBe(202);
        const [managed, confirmed] = await Promise.all([
          request("POST", `/admin/catalog-products/${product.id}/manage`, writer, {
            action: "update-content", expected_updated_at: before.updated_at,
            content: { title: "Stale operator content", subtitle: null, description: null },
          }),
          request("POST", `/admin/product-changes/${pending.data.product_change.id}/confirm`, writer, {}),
        ]);
        expect(managed.status).toBe(409);
        expect(["catalog_pending_change", "catalog_product_changed"]).toContain(managed.data.code);
        expect(confirmed.status).toBe(200);
        const stored = await persistedProduct(product.id);
        expect(stored.product.title).toBe("Reviewed seller content");
        expect(stored.changes.some(change => change.status === "pending")).toBe(false);
      });

      it("applies authorized variants, attributes and owned images while rejecting invalid ownership and options", async () => {
        const writer = await operator();
        const owner = await vendor();
        const other = await vendor();
        await permission(writer, owner, "authorized");
        const { result: ownedImage } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: owner });
        const { result: foreignImage } = await createCatalogPermissionImageFixtureWorkflow(getContainer()).run({ input: other });
        const product = await createProduct(owner, {
          title: `Axis fixture ${randomUUID()}`, status: "proposed",
          attributes: [{ title: "Size", type: "multi_select", is_variant_axis: true, values: ["Small", "Medium"] }],
          variants: [{ title: "Small", sku: `catalog-${randomUUID()}`, options: { Size: "Small" } }],
          images: [{ url: ownedImage.url }], thumbnail: ownedImage.url,
        });
        const base = `/vendor/products/${product.id}`;
        await confirmedChange(owner, "POST", `${base}/variants`, { title: "Medium", sku: `catalog-${randomUUID()}`, options: { Size: "Medium" } });
        const medium = (await readProduct(owner, product.id)).variants.find((variant: { title: string }) => variant.title === "Medium");
        expect(medium.id).toEqual(expect.any(String));
        await confirmedChange(owner, "POST", `${base}/variants/${medium.id}`, { title: "Medium revised" });
        await confirmedChange(owner, "POST", `${base}/attributes/batch`, { add: [{ title: "Specification", type: "text", value: "Original" }] });
        const { data: products } = await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({
          entity: "product", fields: ["id", "product_attribute_values.name", "product_attribute_values.attribute.id", "product_attribute_values.attribute.name"], filters: { id: product.id },
        }, { cache: { enable: false } });
        const specification = products[0].product_attribute_values?.find(value => value?.attribute?.name === "Specification");
        expect(specification?.name).toBe("Original");
        const attributeId = specification!.attribute!.id;
        await confirmedChange(owner, "POST", `${base}/attributes/batch`, { update: [{ id: attributeId, value: "Revised" }] });
        const withImages = await readProduct(owner, product.id);
        const imageId = withImages.images[0].id;
        await confirmedChange(owner, "POST", `${base}/variants/${medium.id}`, { images: { add: [imageId] } });
        const variant = await request("GET", `${base}/variants/${medium.id}`, owner);
        expect(variant.status).toBe(200);
        expect(variant.data.variant.images).toEqual([expect.objectContaining({ id: imageId, url: ownedImage.url })]);
        const beforeInvalid = await persistedProduct(product.id);
        const foreignGallery = await request("POST", base, owner, { images: [{ url: foreignImage.url }], thumbnail: foreignImage.url });
        expect(foreignGallery.status).toBe(400);
        expect(foreignGallery.data).toMatchObject({ type: "not_allowed", message: "Catalog image access is not permitted." });
        expect((await request("POST", `${base}/variants/${medium.id}`, owner, { images: { add: ["img_foreign_fixture"] } })).status).toBe(400);
        expect((await request("POST", `${base}/variants`, owner, { title: "Wrong axis", sku: `catalog-${randomUUID()}`, options: { Size: "Missing" } })).status).toBe(400);
        expect((await request("POST", `${base}/variants/${medium.id}`, owner, { manage_inventory: true })).status).toBe(400);
        expect(await persistedProduct(product.id)).toEqual(beforeInvalid);
        await confirmedChange(owner, "POST", `${base}/attributes/batch`, { remove: [attributeId] });
        await confirmedChange(owner, "DELETE", `${base}/variants/${medium.id}`);
        expect((await readProduct(owner, product.id)).variants.map((variant: { id: string }) => variant.id)).not.toContain(medium.id);
        const finalState = await persistedProduct(product.id);
        expect(finalState.changes.every(change => change.status === "confirmed")).toBe(true);
        expect(finalState.actions.map(action => action.action)).toEqual(expect.arrayContaining(["VARIANT_ADD", "VARIANT_UPDATE", "VARIANT_REMOVE", "ATTRIBUTE_ADD", "ATTRIBUTE_UPDATE", "ATTRIBUTE_REMOVE"]));
      });

      it("leaves old pending proposals for review and applies revocation immediately to later writes", async () => {
        const writer = await operator();
        const owner = await vendor();
        const pendingProduct = await createProduct(owner);
        const pendingEdit = await request("POST", `/vendor/products/${pendingProduct.id}`, owner, { title: "Old pending title" });
        expect(pendingEdit.status).toBe(202);
        const beforeGrant = await persistedProduct(pendingProduct.id);
        await permission(writer, owner, "authorized");
        expect(await persistedProduct(pendingProduct.id)).toEqual(beforeGrant);
        expect((await readProduct(owner, pendingProduct.id)).status).toBe("proposed");
        const authorizedProduct = await createProduct(owner);
        expect(authorizedProduct.status).toBe("published");
        expect((await request("POST", `/vendor/sellers/${owner.sellerId}`, owner, { metadata: null })).status).toBe(200);
        expect(await readPermission(writer, owner)).toBe("authorized");
        await permission(writer, owner, "supervised");
        expect(await readPermission(writer, owner)).toBe("supervised");
        const revoked = await request("POST", `/vendor/products/${authorizedProduct.id}`, owner, { title: "Requires approval after revocation" });
        expect(revoked.status).toBe(202);
        expect(revoked.data.product_change.status).toBe("pending");
        expect((await readProduct(owner, authorizedProduct.id)).title).toBe(authorizedProduct.title);
        expect((await createProduct(owner)).status).toBe("proposed");
        expect(await persistedProduct(pendingProduct.id)).toEqual(beforeGrant);
      });

      it("keeps native shared published catalogue editable while denying foreign private proposals and forged seller context", async () => {
        const writer = await operator();
        const owner = await vendor();
        const other = await vendor();
        const privateProduct = await createProduct(other);
        await permission(writer, owner, "authorized");
        const { result: sharedProducts } = await createProductsWorkflow(getContainer()).run({ input: {
          created_by: writer.userId,
          products: [{ ...productInput("Shared published fixture"), status: ProductStatus.PUBLISHED }],
        } });
        const shared = sharedProducts[0];
        await confirmedChange(owner, "POST", `/vendor/products/${shared.id}`, { title: "Authorized shared title" });
        expect((await persistedProduct(shared.id)).product.title).toBe("Authorized shared title");
        const beforeForeign = await persistedProduct(privateProduct.id);
        for (const suffix of ["", "/preview", "/variants", `/variants/${privateProduct.variants[0].id}`]) {
          expect((await request("GET", `/vendor/products/${privateProduct.id}${suffix}`, owner)).status).toBe(404);
        }
        expect((await request("POST", `/vendor/products/${privateProduct.id}`, owner, { title: "Unauthorized private edit" })).status).toBe(404);
        expect((await request("GET", `/vendor/products/${privateProduct.id}`, { ...owner, sellerId: other.sellerId })).status).toBe(400);
        expect(await persistedProduct(privateProduct.id)).toEqual(beforeForeign);
      });

      it("serializes concurrent authorized edits of a shared product and prevents duplicate variant combinations", async () => {
        const writer = await operator();
        const first = await vendor();
        const second = await vendor();
        await permission(writer, first, "authorized");
        await permission(writer, second, "authorized");
        const { result: products } = await createProductsWorkflow(getContainer()).run({ input: {
          created_by: writer.userId,
          products: [{
            title: `Shared concurrency fixture ${randomUUID()}`, status: ProductStatus.PUBLISHED,
            attributes: [{ title: "Size", type: AttributeType.MULTI_SELECT, is_variant_axis: true, values: ["Small", "Medium"] }],
            variants: [{ title: "Small", sku: `catalog-${randomUUID()}`, options: { Size: "Small" } }],
          }],
        } });
        const product = products[0];
        const before = await persistedProduct(product.id);
        const skus = [`catalog-first-${randomUUID()}`, `catalog-second-${randomUUID()}`];
        const outcomes = await Promise.all([first, second].map((actor, index) => request("POST", `/vendor/products/${product.id}/variants`, actor, {
          title: `Medium ${index}`, sku: skus[index], options: { Size: "Medium" },
        })));
        expect(outcomes.map(outcome => outcome.status).sort()).toEqual([202, 400]);
        const accepted = outcomes.find(outcome => outcome.status === 202)!;
        expect(accepted.data.product_change).toMatchObject({ status: "confirmed", confirmed_by: expect.any(String) });
        const rejected = outcomes.find(outcome => outcome.status === 400)!;
        expect(rejected.data).toMatchObject({ type: "invalid_data", message: "Duplicate variant combination." });
        const current = await readProduct(first, product.id);
        expect(current.status).toBe("published");
        expect(current.variants).toHaveLength(2);
        expect(current.variants.filter((variant: { sku: string }) => skus.includes(variant.sku))).toHaveLength(1);
        const after = await persistedProduct(product.id);
        expect(after.changes).toHaveLength(before.changes.length + 1);
        expect(after.changes.every(change => change.status === "confirmed")).toBe(true);
        expect(after.actions.filter(action => action.action === "VARIANT_ADD")).toHaveLength(1);
      });
    },
  });
}
