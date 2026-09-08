import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";

type GraphInput = { entity: string; filters?: Record<string, unknown> };
type Scope = { resolve(key: string): { graph(input: GraphInput): Promise<{ data: Record<string, unknown>[] }> } };
type Request = { scope: Scope; seller_context: { seller_id: string }; filterableFields?: Record<string, unknown> };
type Middleware = (request: Request, response: object, next: () => void) => Promise<void>;
type Helpers = { getProductIdsRestrictedFromSeller(scope: Scope, sellerId: string, productIds?: string[]): Promise<string[]> };

const packageRoot = path.dirname(require.resolve("@mercurjs/core/package.json"));
const sourceDirectory = ".medusa/server/src/api/vendor/products";
const patchPath = path.resolve(__dirname, "../../../../..", "patches/@mercurjs__core@2.3.3.patch");
const nativeRequire = createRequire(path.join(packageRoot, "package.json"));
let directory: string;
let original: { middleware: Middleware; helpers: Helpers };
let patched: typeof original;

function loadSource(base: string) {
  const helpers = {} as Helpers;
  const utilities = {
    ContainerRegistrationKeys: { QUERY: "query" },
    PolicyOperation: { read: "read", create: "create", update: "update", delete: "delete" },
    promiseAll: <T>(values: Promise<T>[]) => Promise.all(values),
  };
  const getModule = (id: string): unknown => {
    if (id === "@medusajs/framework/utils") return utilities;
    if (id === "@mercurjs/types") return nativeRequire(id);
    if (id === "./helpers") return helpers;
    if (id === "@medusajs/framework") return {
      validateAndTransformQuery: () => () => undefined,
      validateAndTransformBody: () => () => undefined,
    };
    if (id === "../../utils/policy-resources") return { PolicyResource: {} };
    if (id === "./query-config") return nativeRequire(path.join(packageRoot, sourceDirectory, "query-config.js"));
    return {};
  };
  runInNewContext(readFileSync(path.join(base, "helpers.js"), "utf8"), { exports: helpers, require: getModule });
  const exports = {} as { vendorProductsMiddlewares: { matcher: string; middlewares: Middleware[] }[] };
  runInNewContext(readFileSync(path.join(base, "middlewares.js"), "utf8"), { exports, require: getModule });
  const route = exports.vendorProductsMiddlewares.find(({ matcher }) => matcher === "/vendor/products");
  expect(route).toBeDefined();
  return { helpers, middleware: route!.middlewares[1] };
}

beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), "vendor-visibility-patch-"));
  const target = path.join(directory, sourceDirectory);
  mkdirSync(target, { recursive: true });
  for (const file of ["helpers.js", "middlewares.js", "helpers.d.ts"]) {
    writeFileSync(path.join(target, file), readFileSync(path.join(packageRoot, sourceDirectory, file)));
  }
  const apply = (args: string[]) => execFileSync("git", ["apply", `--include=${sourceDirectory}/*`, ...args, patchPath], { cwd: directory, stdio: "pipe" });
  try { apply(["--check"]); } catch { apply(["--reverse"]); }
  original = loadSource(target);
  apply([]);
  patched = loadSource(target);
});

afterAll(() => {
  if (directory && path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) && path.basename(directory).startsWith("vendor-visibility-patch-")) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const products = [
  { id: "public", status: "published" },
  { id: "own", status: "proposed" },
  { id: "other", status: "published" },
  { id: "both", status: "published" },
  { id: "assigned", status: "published" },
  { id: "foreign_draft", status: "proposed" },
];
const links = [
  { product_id: "other", seller_id: "seller_other" },
  { product_id: "both", seller_id: "seller_other" },
  { product_id: "both", seller_id: "seller_current" },
  { product_id: "assigned", seller_id: "seller_current" },
  { product_id: null, seller_id: "seller_other" },
];

function fixture() {
  const graph = jest.fn(async (input: GraphInput) => {
    if (input.entity === "product_change_action") {
      expect(input.filters?.product_change).toEqual({ created_by: "seller_current" });
      return { data: [{ product_id: "own" }] };
    }
    expect(input.entity).toBe("product_seller");
    expect(input.filters?.seller_id).toBeUndefined();
    const ids = input.filters?.product_id as string[] | undefined;
    return { data: ids ? links.filter((link) => ids.includes(link.product_id ?? "")) : links };
  });
  return { graph, scope: { resolve: () => ({ graph }) } as Scope };
}

function matches(product: Record<string, unknown>, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === "$and") return (value as Record<string, unknown>[]).every((entry) => matches(product, entry));
    if (key === "$or") return (value as Record<string, unknown>[]).some((entry) => matches(product, entry));
    if (Array.isArray(value)) return value.includes(product[key]);
    if (value && typeof value === "object") {
      const operator = value as { $nin?: unknown[]; $in?: unknown[] };
      if (operator.$nin) return !operator.$nin.includes(product[key]);
      if (operator.$in) return operator.$in.includes(product[key]);
    }
    return product[key] === value;
  });
}

it.each([
  ["single public", "public", ["public"]],
  ["creator-owned draft", "own", ["own"]],
  ["other seller only", "other", []],
  ["both sellers", "both", ["both"]],
  ["assigned current seller", "assigned", ["assigned"]],
  ["foreign unpublished", "foreign_draft", []],
  ["missing product", "missing", []],
  ["mixed IDs", ["public", "own", "other", "both"], ["public", "own", "both"]],
  ["empty IDs", [], []],
  ["whole catalog", undefined, ["public", "own", "both", "assigned"]],
  ["operator fallback", { $in: ["public", "other"] }, ["public"]],
  ["mixed-type fallback", ["public", 123], ["public"]],
  ["non-string fallback", 123, []],
] as [string, unknown, string[]][])("preserves visibility for %s", async (_label, id, expected) => {
  const before = fixture();
  const after = fixture();
  const originalRequest: Request = { scope: before.scope, seller_context: { seller_id: "seller_current" }, filterableFields: { id } };
  const patchedRequest: Request = { scope: after.scope, seller_context: { seller_id: "seller_current" }, filterableFields: { id } };
  const next = jest.fn();
  await original.middleware(originalRequest, {}, () => undefined);
  await patched.middleware(patchedRequest, {}, next);
  const visible = (request: Request) => products.filter((product) => matches(product, request.filterableFields!)).map((product) => product.id);
  expect(visible(patchedRequest)).toEqual(expected);
  expect(visible(patchedRequest)).toEqual(visible(originalRequest));
  expect(next).toHaveBeenCalledTimes(1);
  expect(after.graph).toHaveBeenCalledTimes(2);
  const linkRead = after.graph.mock.calls.find(([input]) => input.entity === "product_seller")![0];
  const supportedIds = typeof id === "string" ? [id] : Array.isArray(id) && id.every((entry) => typeof entry === "string") ? id : undefined;
  expect(linkRead.filters).toEqual(supportedIds ? { product_id: supportedIds } : undefined);
});

it("preserves caller AND filters and current seller ownership independently", async () => {
  const state = fixture();
  const request: Request = { scope: state.scope, seller_context: { seller_id: "seller_current" }, filterableFields: { id: ["public", "own", "other"], $and: [{ status: "published" }] } };
  await patched.middleware(request, {}, () => undefined);
  expect(products.filter((product) => matches(product, request.filterableFields!)).map((product) => product.id)).toEqual(["public"]);
  expect((request.filterableFields!.$and as unknown[])[0]).toEqual({ status: "published" });
});

it("retains full native behavior when filterableFields is absent", async () => {
  const state = fixture();
  const request: Request = { scope: state.scope, seller_context: { seller_id: "seller_current" } };
  await patched.middleware(request, {}, () => undefined);
  expect(state.graph.mock.calls.find(([input]) => input.entity === "product_seller")![0].filters).toBeUndefined();
  expect(request.filterableFields?.$and).toHaveLength(1);
});

it("does not call next when the restriction read fails", async () => {
  const state = fixture();
  state.graph.mockResolvedValueOnce({ data: [{ product_id: "own" }] });
  state.graph.mockRejectedValueOnce(new Error("read failed"));
  const next = jest.fn();
  await expect(patched.middleware({ scope: state.scope, seller_context: { seller_id: "seller_current" }, filterableFields: { id: "public" } }, {}, next)).rejects.toThrow("read failed");
  expect(next).not.toHaveBeenCalled();
});
