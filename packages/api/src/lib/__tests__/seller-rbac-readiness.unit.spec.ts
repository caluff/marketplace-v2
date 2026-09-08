import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import type {
  CreateRbacRoleDTO,
  CreateRbacRolePolicyDTO,
  IRbacModuleService,
  RbacPolicyDTO,
  RbacRoleDTO,
  RbacRolePolicyDTO,
} from "@medusajs/framework/types";

type Initializer = {
  SELLER_ROLES: Pick<RbacRoleDTO, "id" | "name" | "description">[];
  ensureSellerDefaultRoles(service: IRbacModuleService): Promise<RbacRoleDTO[]>;
  ensureSellerDefaultRolesReady(service: IRbacModuleService): Promise<RbacRoleDTO[]>;
};
const packageRoot = path.dirname(require.resolve("@mercurjs/core/package.json"));
const sourcePath = ".medusa/server/src/modules/seller/utils/ensure-seller-default-roles.js";
const installedPath = path.join(packageRoot, sourcePath);
const patchPath = path.resolve(__dirname, "../../../../..", "patches/@mercurjs__core@2.3.3.patch");
let directory: string;
let patched: Initializer;
let original: Initializer;

function loadInitializer(source: string): Initializer {
  const exports = {};
  runInNewContext(source, { exports, require: createRequire(installedPath) });
  return exports as Initializer;
}

beforeAll(() => {
  // Exercise the maintained patch without modifying installed packages or using services.
  directory = mkdtempSync(path.join(tmpdir(), "seller-rbac-patch-"));
  const target = path.join(directory, sourcePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(installedPath));
  const apply = (args: string[]) => execFileSync("git", ["apply", `--include=${sourcePath}`, ...args, patchPath], {
    cwd: directory,
    stdio: "pipe",
  });
  try {
    apply(["--check"]);
  } catch {
    // Also run after the coordinator has registered/applied the package patch.
    apply(["--reverse"]);
  }
  original = loadInitializer(readFileSync(target, "utf8"));
  apply([]);
  patched = loadInitializer(readFileSync(target, "utf8"));
});

afterAll(() => {
  if (directory && path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) && path.basename(directory).startsWith("seller-rbac-patch-")) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(existing = true) {
  const roles: RbacRoleDTO[] = existing
    ? patched.SELLER_ROLES.map(({ id, name, description }) => ({ id, name, description }))
    : [];
  const policies: RbacPolicyDTO[] = [
    { id: "policy_product_read", key: "product:read", resource: "product", operation: "read" },
    { id: "policy_order_read", key: "order:read", resource: "order", operation: "read" },
  ];
  const bindings: RbacRolePolicyDTO[] = [];
  const service = {
    listRbacRoles: jest.fn(async () => [...roles]),
    createRbacRoles: jest.fn(async (data: (CreateRbacRoleDTO & Pick<RbacRoleDTO, "id">)[]) => {
      const created = data.map(role => ({ ...role }));
      if (created.some(role => roles.some(existingRole => existingRole.id === role.id))) {
        // Simulate the database constraint failure, not an HTTP adapter error.
        // eslint-disable-next-line @medusajs/use-medusa-error-not-generic-error
        throw new Error("duplicate role");
      }
      roles.push(...created);
      return created;
    }),
    listRbacPolicies: jest.fn(async () => [...policies]),
    listRbacRolePolicies: jest.fn(async () => [...bindings]),
    createRbacRolePolicies: jest.fn(async (data: CreateRbacRolePolicyDTO[]) => {
      const created = data.map(binding => ({ ...binding, id: `binding_${binding.role_id}_${binding.policy_id}` }));
      bindings.push(...created);
      return created;
    }),
  };
  return { roles, policies, bindings, service, rbac: service as unknown as IRbacModuleService };
}

it("preserves initialization output and grants while selecting only consumed read fields", async () => {
  const before = fixture(false);
  const after = fixture(false);
  expect(await patched.ensureSellerDefaultRoles(after.rbac)).toEqual(
    await original.ensureSellerDefaultRoles(before.rbac),
  );
  expect(after.bindings).toEqual(before.bindings);
  expect(after.service.listRbacPolicies).toHaveBeenCalledWith({}, { select: ["id", "key"] });
  expect(after.service.listRbacRolePolicies).toHaveBeenCalledWith(
    { role_id: patched.SELLER_ROLES.map(role => role.id) },
    { select: ["role_id", "policy_id"] },
  );
});

it("starts the binding read while the independent policy read is still pending", async () => {
  const state = fixture();
  let release!: (policies: RbacPolicyDTO[]) => void;
  let started!: () => void;
  const policyReadStarted = new Promise<void>(resolve => { started = resolve; });
  state.service.listRbacPolicies.mockImplementationOnce(() => new Promise(resolve => {
    release = resolve;
    started();
  }));
  const pending = patched.ensureSellerDefaultRoles(state.rbac);
  await policyReadStarted;
  expect(state.service.listRbacRolePolicies).toHaveBeenCalledTimes(1);
  expect(state.service.createRbacRolePolicies).not.toHaveBeenCalled();
  release(state.policies);
  await pending;
});

it.each(["listRbacPolicies", "listRbacRolePolicies"] as const)("retries after a transient %s failure without retaining failed readiness", async method => {
  const state = fixture();
  state.service[method].mockRejectedValueOnce(new Error("transient failure"));
  await expect(patched.ensureSellerDefaultRoles(state.rbac)).rejects.toThrow("transient failure");
  expect(state.service.createRbacRolePolicies).not.toHaveBeenCalled();
  await patched.ensureSellerDefaultRoles(state.rbac);
  expect(state.service[method]).toHaveBeenCalledTimes(2);
  expect(state.bindings.length).toBeGreaterThan(0);
});

it("retries binding creation after roles were committed but binding creation failed", async () => {
  const state = fixture(false);
  state.service.createRbacRolePolicies.mockRejectedValueOnce(new Error("write failed"));
  await expect(patched.ensureSellerDefaultRoles(state.rbac)).rejects.toThrow("write failed");
  await patched.ensureSellerDefaultRoles(state.rbac);
  expect(state.service.createRbacRoles).toHaveBeenCalledTimes(1);
  expect(state.service.createRbacRolePolicies).toHaveBeenCalledTimes(2);
});

it("does not introduce a process cache across concurrent requests or a second service container", async () => {
  const first = fixture();
  await patched.ensureSellerDefaultRoles(first.rbac);
  first.service.createRbacRolePolicies.mockClear();
  await Promise.all([
    patched.ensureSellerDefaultRoles(first.rbac),
    patched.ensureSellerDefaultRoles(first.rbac),
  ]);
  expect(first.service.listRbacRoles).toHaveBeenCalledTimes(3);
  expect(first.service.createRbacRolePolicies).not.toHaveBeenCalled();
  const second = fixture();
  second.bindings.push(...first.bindings);
  await patched.ensureSellerDefaultRoles(second.rbac);
  expect(second.service.listRbacRoles).toHaveBeenCalledTimes(1);
  expect(second.service.listRbacPolicies).toHaveBeenCalledTimes(1);
  expect(second.service.createRbacRolePolicies).not.toHaveBeenCalled();
});

it("documents the pre-existing concurrent empty-database collision and allows a later retry", async () => {
  const state = fixture(false);
  const results = await Promise.allSettled([
    patched.ensureSellerDefaultRoles(state.rbac),
    patched.ensureSellerDefaultRoles(state.rbac),
  ]);
  expect(results.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  await expect(patched.ensureSellerDefaultRoles(state.rbac)).resolves.toHaveLength(patched.SELLER_ROLES.length);
});

it("documents why readiness caching is unsafe: both original and fallback restore a revoked default binding", async () => {
  for (const initializer of [original, patched]) {
    const state = fixture();
    await initializer.ensureSellerDefaultRoles(state.rbac);
    const revoked = state.bindings.shift()!;
    await initializer.ensureSellerDefaultRoles(state.rbac);
    expect(state.bindings).toContainEqual(revoked);
    // New service objects (another container/worker) cannot distinguish revocation from incomplete setup either.
    const second = fixture();
    second.bindings.push(...state.bindings.filter(binding => binding.id !== revoked.id));
    await initializer.ensureSellerDefaultRoles(second.rbac);
    expect(second.bindings).toContainEqual(revoked);
  }
});

it("reads policy changes again on the next call instead of requiring cache version invalidation", async () => {
  const state = fixture();
  await patched.ensureSellerDefaultRoles(state.rbac);
  state.policies.push({ id: "new_policy", key: "file:create", resource: "file", operation: "create" });
  await patched.ensureSellerDefaultRoles(state.rbac);
  expect(state.bindings.some(binding => binding.policy_id === "new_policy")).toBe(true);
  expect(state.service.listRbacPolicies).toHaveBeenCalledTimes(2);
});

it("coalesces the middleware bootstrap and does not restore revoked bindings on later navigation", async () => {
  const state = fixture(false);
  const results = await Promise.all([
    patched.ensureSellerDefaultRolesReady(state.rbac),
    patched.ensureSellerDefaultRolesReady(state.rbac),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(state.service.listRbacRoles).toHaveBeenCalledTimes(1);
  expect(state.service.createRbacRoles).toHaveBeenCalledTimes(1);
  const revoked = state.bindings.shift()!;
  await patched.ensureSellerDefaultRolesReady(state.rbac);
  expect(state.bindings).not.toContainEqual(revoked);
  expect(state.service.listRbacPolicies).toHaveBeenCalledTimes(1);
  const separateProcess = fixture();
  await patched.ensureSellerDefaultRolesReady(separateProcess.rbac);
  expect(separateProcess.service.listRbacRoles).toHaveBeenCalledTimes(1);
});

it("retries failed middleware readiness, but not successful readiness", async () => {
  const state = fixture();
  state.service.listRbacPolicies.mockRejectedValueOnce(new Error("database offline"));
  await expect(patched.ensureSellerDefaultRolesReady(state.rbac)).rejects.toThrow("database offline");
  await patched.ensureSellerDefaultRolesReady(state.rbac);
  await patched.ensureSellerDefaultRolesReady(state.rbac);
  expect(state.service.listRbacPolicies).toHaveBeenCalledTimes(2);
});
