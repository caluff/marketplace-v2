/**
 * Disposable PostgreSQL/TLS Redis only, following vendor-onboarding.spec.ts.
 * Set GOOGLE_AUTH_TESTS=disposable-local, NODE_ENV=test, DB_HOST=localhost,
 * DB_USERNAME, DB_PASSWORD, DB_PORT and a dedicated rediss://...@localhost:.../1.
 * The runner creates and drops a random database; never use shared infrastructure.
 * Google callbacks are represented by native Auth Module fixtures so this suite
 * never contacts Google or requires real OAuth credentials.
 */
import { randomUUID } from "node:crypto";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { createCustomerAccountWorkflow } from "@medusajs/core-flows";
import type { IAuthModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, generateJwtToken, Modules } from "@medusajs/framework/utils";

if (process.env.GOOGLE_AUTH_TESTS !== "disposable-local") {
  describe.skip("Google auth HTTP integration (requires disposable-local)", () => {
    it("requires isolated PostgreSQL and TLS Redis; see file header", () => {});
  });
} else {
  if (process.env.NODE_ENV !== "test" || process.env.DB_HOST !== "localhost" || !process.env.DB_USERNAME || !process.env.DB_PASSWORD || !process.env.DB_PORT) {
    throw new Error("Google auth tests require explicit disposable localhost PostgreSQL credentials and NODE_ENV=test.");
  }
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (redis.protocol !== "rediss:" || redis.hostname !== "localhost" || !redis.username || !redis.password || !/^\/(?:[1-9]|1[0-5])$/.test(redis.pathname)) {
    throw new Error("Google auth tests require a dedicated localhost TLS Redis instance with a nonzero database.");
  }
  if (process.env.DB_TEMP_NAME || process.env.MEDUSA_DB_SCHEMA) throw new Error("Remove DB_TEMP_NAME and MEDUSA_DB_SCHEMA; this suite owns its disposable database.");
  const dbName = `google_test_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:${process.env.DB_PORT}/${dbName}`;
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  jest.setTimeout(120_000);

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async container => {
        const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE);
        if (new URL(config.projectConfig.databaseUrl!).pathname !== `/${dbName}`) throw new Error("Application database does not match the disposable Google test database.");
        const notification = config.modules?.[Modules.NOTIFICATION];
        if (notification && typeof notification === "object" && "options" in notification) {
          const providers = notification.options?.providers;
          if (Array.isArray(providers) && providers.some((provider: { resolve?: unknown }) => typeof provider.resolve !== "string" || !/(notification-local|notification-mock)$/.test(provider.resolve))) {
            throw new Error("Use only local/mock notifications in the disposable Google test configuration.");
          }
        }
      },
    },
    testSuite: ({ api, getContainer }) => {
      const auth = () => getContainer().resolve<IAuthModuleService>(Modules.AUTH);
      function token(identityId: string, provider = "google", actorId = "", actorType = "customer") {
        const { http } = getContainer().resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig;
        return generateJwtToken({ actor_id: actorId, actor_type: actorType, auth_identity_id: identityId, auth_provider: provider, app_metadata: {} }, { secret: http.jwtSecret, expiresIn: "10m", jwtOptions: http.jwtOptions });
      }
      async function googleIdentity(email: string, provider = "google") {
        return auth().createAuthIdentities({ provider_identities: [{ provider, entity_id: randomUUID(), user_metadata: { email } }] });
      }
      const headers = (value: string) => ({ authorization: `Bearer ${value}` });

      it("requires authentication and rejects non-Google and cross-actor tokens", async () => {
        await expect(api.post("/auth/google/complete", { actor_type: "customer" })).rejects.toMatchObject({ response: { status: 401 } });
        const identity = await googleIdentity(`${randomUUID()}@example.invalid`);
        for (const value of [token(identity.id, "emailpass"), token(identity.id, "google", "", "user")]) {
          await expect(api.post("/auth/google/complete", { actor_type: "customer" }, { headers: headers(value) })).rejects.toMatchObject({ response: { status: 401 } });
        }
      });

      it("preserves the existing customer identity while attaching Google and refreshes natively", async () => {
        const email = `${randomUUID()}@example.invalid`;
        const existing = await auth().createAuthIdentities({ provider_identities: [{ provider: "emailpass", entity_id: email }] });
        const { result: customer } = await createCustomerAccountWorkflow(getContainer()).run({ input: { authIdentityId: existing.id, customerData: { email } } });
        const google = await googleIdentity(email);
        const partial = token(google.id);
        const first = await api.post("/auth/google/complete", { actor_type: "customer" }, { headers: headers(partial) });
        expect(first.data).toEqual({ status: "link_required" });
        await expect(api.post("/auth/google/complete", { actor_type: "customer", existing_token: token(existing.id, "emailpass") }, { headers: headers(partial) })).rejects.toMatchObject({ response: { status: 401 } });
        const linked = await api.post("/auth/google/complete", { actor_type: "customer", existing_token: token(existing.id, "emailpass", customer.id) }, { headers: headers(partial) });
        expect(linked.data.status).toBe("complete");
        const canonical = await auth().retrieveAuthIdentity(existing.id, { relations: ["provider_identities"] });
        expect(canonical.app_metadata?.customer_id).toBe(customer.id);
        expect(canonical.provider_identities?.map(provider => provider.provider).sort()).toEqual(["emailpass", "google"]);
        const orphan = await auth().retrieveAuthIdentity(google.id, { relations: ["provider_identities"] });
        expect(orphan.provider_identities).toEqual([]);
        const refreshed = await api.post("/auth/token/refresh", {}, { headers: headers(linked.data.token) });
        expect(refreshed.data.token).toEqual(expect.any(String));
      });

      it("does not create operators or vendor members", async () => {
        for (const actorType of ["user", "member"]) {
          const provider = actorType === "user" ? "google-admin" : "google";
          const identity = await googleIdentity(`${randomUUID()}@example.invalid`, provider);
          await expect(api.post("/auth/google/complete", { actor_type: actorType }, { headers: headers(token(identity.id, provider, "", actorType)) })).rejects.toMatchObject({ response: { status: 403 } });
          expect((await auth().retrieveAuthIdentity(identity.id)).app_metadata?.[`${actorType}_id`]).toBeUndefined();
        }
      });

      it("automatically links an authoritative Gmail customer to its existing native identity", async () => {
        const email = `google-integration-${randomUUID()}@gmail.com`;
        const existing = await auth().createAuthIdentities({ provider_identities: [{ provider: "emailpass", entity_id: email }] });
        const { result: customer } = await createCustomerAccountWorkflow(getContainer()).run({ input: { authIdentityId: existing.id, customerData: { email } } });
        const google = await googleIdentity(email);
        const linked = await api.post("/auth/google/complete", { actor_type: "customer" }, { headers: headers(token(google.id)) });
        expect(linked.data.status).toBe("complete");
        const canonical = await auth().retrieveAuthIdentity(existing.id, { relations: ["provider_identities"] });
        expect(canonical.app_metadata?.customer_id).toBe(customer.id);
        expect(canonical.provider_identities?.map(provider => provider.provider).sort()).toEqual(["emailpass", "google"]);
        expect((await auth().retrieveAuthIdentity(google.id, { relations: ["provider_identities"] })).provider_identities).toEqual([]);
        const refreshed = await api.post("/auth/token/refresh", {}, { headers: headers(linked.data.token) });
        expect(refreshed.data.token).toEqual(expect.any(String));
      });
    },
  });
}
