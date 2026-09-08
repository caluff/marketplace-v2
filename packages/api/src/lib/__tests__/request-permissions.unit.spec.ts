import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import type { MedusaContainer } from "@medusajs/framework/types";
import type { hasPermission, resolvePermissions } from "@medusajs/framework";

type PatchedPolicies = {
  hasPermission: typeof hasPermission;
  resolvePermissions: typeof resolvePermissions;
  initializeReadOnlyRequestPolicyCache(container: MedusaContainer): void;
};
const frameworkRoot = path.resolve(path.dirname(require.resolve("@medusajs/framework")), "..");
const exportsObject = {};
runInNewContext(readFileSync(path.join(frameworkRoot, "dist/policies/has-permission.js"), "utf8"), {
  exports: exportsObject,
  require: () => ({ WILDCARD: "*", ContainerRegistrationKeys: { QUERY: "query", FEATURE_FLAG_ROUTER: "flags" } }),
});
const policies = exportsObject as PatchedPolicies;

function fixture(enroll = true) {
  let allowed = true;
  const graph = jest.fn(async ({ filters }: { filters: { id: string } }) => ({
    data: [{ id: filters.id, policies: allowed ? [{ id: "policy_read", resource: "product", operation: "read" }] : [] }],
  }));
  const container = { resolve: (key: string) => key === "query" ? { graph } : { isFeatureEnabled: () => true } } as unknown as MedusaContainer;
  if (enroll) policies.initializeReadOnlyRequestPolicyCache(container);
  const check = (role = "role_inventory", scope = container) => policies.hasPermission({
    container: scope, roles: [role], actions: { resource: "product", operation: "read" },
  });
  return { container, graph, check, revoke: () => { allowed = false; } };
}

it("shares one policy read between concurrent route, field and permission-list checks", async () => {
  const f = fixture();
  const [route, fields, permissions] = await Promise.all([
    f.check(), f.check(), policies.resolvePermissions({ container: f.container, roles: ["role_inventory"], universe: [{ resource: "product", operation: "read" }] }),
  ]);
  expect(route).toBe(true);
  expect(fields).toBe(true);
  expect([...permissions]).toEqual(["product:read"]);
  expect(f.graph).toHaveBeenCalledTimes(1);
  expect(f.graph).toHaveBeenCalledWith(expect.anything(), { cache: { enable: false } });
});

it("isolates roles and request scopes and sees revocation on the next request", async () => {
  const f = fixture();
  await Promise.all([f.check(), f.check("role_support")]);
  expect(f.graph).toHaveBeenCalledTimes(2);
  f.revoke();
  const next = { ...f.container } as MedusaContainer;
  policies.initializeReadOnlyRequestPolicyCache(next);
  expect(await f.check("role_inventory", next)).toBe(false);
  expect(f.graph).toHaveBeenCalledTimes(3);
});

it("never retains policies in an unenrolled mutation, workflow or root scope", async () => {
  const f = fixture(false);
  expect(await f.check()).toBe(true);
  f.revoke();
  expect(await f.check()).toBe(false);
  expect(f.graph).toHaveBeenCalledTimes(2);
});

it("evicts a failed policy read so the same request can retry", async () => {
  const f = fixture();
  f.graph.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(f.check()).rejects.toThrow("database unavailable");
  expect(await f.check()).toBe(true);
  expect(f.graph).toHaveBeenCalledTimes(2);
});

it("enrolls only GET/HEAD in the real HTTP router, before route registration", () => {
  const router = readFileSync(path.join(frameworkRoot, "dist/http/router.js"), "utf8");
  expect(router).toContain('req.method === "GET" || req.method === "HEAD"');
  expect(router.indexOf("initializeReadOnlyRequestPolicyCache)(req.scope)")).toBeLessThan(router.indexOf("sortedRoutes.forEach"));
});
