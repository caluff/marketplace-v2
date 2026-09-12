import { createRequire } from "node:module";
import path from "node:path";
import type { MedusaRequest, MedusaResponse, MiddlewareFunction } from "@medusajs/framework/http";
import { getOrdersListWorkflow } from "@medusajs/core-flows";
import { vendorOrdersMiddlewares } from "@mercurjs/core/api/vendor/orders/middlewares";
import { GET } from "@mercurjs/core/api/vendor/orders/route";
import { vendorOrderStageMiddlewares } from "../../api/vendor/orders/middlewares";

jest.mock("@medusajs/core-flows", () => ({ getOrdersListWorkflow: jest.fn() }));

const nativeRequire = createRequire(require.resolve("@medusajs/framework/http"));
const { RoutesSorter } = nativeRequire(path.join(path.dirname(require.resolve("@medusajs/framework/http")), "routes-sorter.js"));
const nativeList = vendorOrdersMiddlewares.find((route) => route.matcher === "/vendor/orders")!;
const middleware = new RoutesSorter([
  ...nativeList.middlewares!.map((handler) => ({ matcher: nativeList.matcher, methods: ["GET"], handler })),
  ...vendorOrderStageMiddlewares.flatMap((route) => route.middlewares!.map((handler) => ({ matcher: route.matcher, methods: ["GET"], handler }))),
]).sort() as { handler: MiddlewareFunction }[];

type Row = Record<string, unknown>;
function matches(row: Row, filters: Row): boolean {
  return Object.entries(filters).every(([key, value]) => {
    if (key === "$or") return (value as Row[]).some((condition) => matches(row, condition));
    if (Array.isArray(value)) return value.includes(row[key]);
    if (value && typeof value === "object" && "$ne" in value) return row[key] !== value.$ne;
    return row[key] === value;
  });
}

const orders = ["pending", "prepared", "partial", "mixed", "shipped", "delivered", "canceled_package", "unpacked", "other"]
  .map((id) => ({ id: `order_${id}`, status: "pending", is_draft_order: false, email: `${id}@example.test` }));
const links = [
  { order_id: "order_prepared", fulfillment_id: "ful_prepared" },
  { order_id: "order_partial", fulfillment_id: "ful_partial" },
  { order_id: "order_mixed", fulfillment_id: "ful_mixed_prepared" },
  { order_id: "order_mixed", fulfillment_id: "ful_mixed_shipped" },
  { order_id: "order_shipped", fulfillment_id: "ful_shipped" },
  { order_id: "order_delivered", fulfillment_id: "ful_delivered" },
  { order_id: "order_canceled_package", fulfillment_id: "ful_canceled" },
  { order_id: "order_unpacked", fulfillment_id: "ful_unpacked" },
  { order_id: "order_other", fulfillment_id: "ful_other" },
];
const fulfillments = links.map(({ fulfillment_id: id }) => ({
  id,
  packed_at: id === "ful_unpacked" ? null : "2026-09-12T10:00:00Z",
  shipped_at: ["ful_mixed_shipped", "ful_shipped", "ful_canceled", "ful_other"].includes(id) ? "2026-09-12T11:00:00Z" : null,
  delivered_at: id === "ful_delivered" ? "2026-09-12T12:00:00Z" : null,
  canceled_at: id === "ful_canceled" ? "2026-09-12T13:00:00Z" : null,
}));

function fixture(query: Row = {}) {
  const graph = jest.fn(async (input: { entity: string; filters: Row }, options?: unknown) => {
    if (input.entity === "order_seller") {
      expect(input.filters.seller_id).toEqual(["seller_own"]);
      return { data: orders.filter((order) => order.id !== "order_other" && (!input.filters.order_id || matches({ order_id: order.id }, { order_id: input.filters.order_id }))).map((order) => ({ order_id: order.id })) };
    }
    expect(options).toEqual({ cache: { enable: false } });
    if (input.entity === "order_fulfillment") return { data: links.filter((link) => matches(link, input.filters)) };
    if (input.entity === "fulfillment") return { data: fulfillments.filter((fulfillment) => matches(fulfillment, input.filters)).map(({ id }) => ({ id })) };
    throw new Error(`Unexpected entity ${input.entity}`);
  });
  const req = {
    query: { ...query },
    seller_context: { seller_id: "seller_own" },
    scope: { resolve: () => ({ graph }) },
  } as unknown as MedusaRequest;
  const res = { json: jest.fn() } as unknown as MedusaResponse;
  const run = jest.fn(async ({ input }) => {
    const filtered = orders.filter((order) => matches(order, input.variables.filters));
    const { skip, take } = input.variables;
    return { result: { rows: filtered.slice(skip, skip + take), metadata: { count: filtered.length, skip, take } } };
  });
  jest.mocked(getOrdersListWorkflow).mockReturnValue({ run } as never);
  return { req, res, graph, run };
}

async function processRequest(req: MedusaRequest, res: MedusaResponse) {
  for (const { handler } of middleware) {
    await new Promise<void>((resolve, reject) => {
      Promise.resolve(handler(req, res, (error?: unknown) => error ? reject(error) : resolve())).catch(reject);
    });
  }
  await GET(req as never, res);
}

beforeEach(() => jest.clearAllMocks());

it("composes around native validation and seller filtering without replacing the native read policy", () => {
  expect(middleware.map(({ handler }) => handler)).toEqual([
    vendorOrderStageMiddlewares[0].middlewares![0],
    ...nativeList.middlewares!,
    vendorOrderStageMiddlewares[1].middlewares![0],
  ]);
  expect(nativeList.policies).toEqual([{ resource: "order", operation: "read" }]);
});

it.each([
  ["pending", ["order_pending", "order_canceled_package", "order_unpacked"]],
  ["prepared", ["order_prepared", "order_partial"]],
  ["shipped", ["order_mixed", "order_shipped", "order_delivered"]],
])("filters %s from native active fulfillment timestamps before pagination", async (stage, expected) => {
  const f = fixture({ fulfillment_stage: stage, status: "pending", fields: "id,status", limit: "1", offset: "1", order: "-created_at" });
  await processRequest(f.req, f.res);
  expect(f.req.filterableFields.id).toEqual(expected);
  expect(f.run).toHaveBeenCalledWith({ input: expect.objectContaining({ variables: expect.objectContaining({
    filters: { id: expected, status: "pending", is_draft_order: false },
    skip: 1,
    take: 1,
    order: { created_at: "DESC" },
  }) }) });
  expect(f.res.json).toHaveBeenCalledWith(expect.objectContaining({ count: expected.length, offset: 1, limit: 1, orders: [expect.objectContaining({ id: expected[1] })] }));
  expect(f.graph.mock.calls.filter(([input]) => input.entity === "fulfillment").every(([input]) => !JSON.stringify(input.filters).includes("ful_other"))).toBe(true);
});

it("preserves unfiltered native lists, status arrays and existing query fields", async () => {
  const f = fixture({ status: ["pending", "completed"], fields: "id", limit: "3", q: "buyer" });
  // Search is handled by the native workflow, not by this extension.
  await processRequest(f.req, f.res);
  expect(f.graph).toHaveBeenCalledTimes(1);
  expect(f.run).toHaveBeenCalledWith({ input: expect.objectContaining({ variables: expect.objectContaining({ filters: expect.objectContaining({ status: ["pending", "completed"], q: "buyer" }) }) }) });
});

it("intersects caller IDs with seller scope before fulfillment reads", async () => {
  const f = fixture({ fulfillment_stage: "shipped", id: ["order_shipped", "order_other"] });
  await processRequest(f.req, f.res);
  expect(f.req.filterableFields.id).toEqual(["order_shipped"]);
  expect(f.graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "order_fulfillment", filters: { order_id: ["order_shipped"] } }), { cache: { enable: false } });
});

it("keeps empty seller scope empty without fulfillment reads", async () => {
  const f = fixture({ fulfillment_stage: "pending", id: "order_other" });
  await processRequest(f.req, f.res);
  expect(f.graph).toHaveBeenCalledTimes(1);
  expect(f.res.json).toHaveBeenCalledWith({ orders: [], count: 0, offset: 0, limit: 50 });
});

it.each(["", "completed", "partially_shipped", ["pending"], { $in: ["pending"] }, 42])("rejects an invalid presentation stage %j", async (stage) => {
  const f = fixture({ fulfillment_stage: stage });
  await expect(processRequest(f.req, f.res)).rejects.toThrow("fulfillment_stage must be");
  expect(f.graph).not.toHaveBeenCalled();
  expect(f.run).not.toHaveBeenCalled();
});

it("preserves strict native validation of unknown parameters", async () => {
  const f = fixture({ fulfillment_stage: "prepared", seller_id: "seller_other" });
  await expect(processRequest(f.req, f.res)).rejects.toThrow();
  expect(f.graph).not.toHaveBeenCalled();
  expect(f.run).not.toHaveBeenCalled();
});

it("fails closed if invoked without native seller scoping", async () => {
  const f = fixture({ fulfillment_stage: "shipped" });
  const prepare = vendorOrderStageMiddlewares[0].middlewares![0] as MiddlewareFunction;
  const apply = vendorOrderStageMiddlewares[1].middlewares![0] as MiddlewareFunction;
  await prepare(f.req, f.res, jest.fn());
  const next = jest.fn();
  await apply(f.req, f.res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Order seller scope is required." }));
  expect(f.graph).not.toHaveBeenCalled();
});

it("does not proceed to the native order read if fulfillment lookup fails", async () => {
  const f = fixture({ fulfillment_stage: "prepared" });
  f.graph.mockResolvedValueOnce({ data: [{ order_id: "order_prepared" }] } as never);
  f.graph.mockRejectedValueOnce(new Error("lookup unavailable"));
  await expect(processRequest(f.req, f.res)).rejects.toThrow("lookup unavailable");
  expect(f.run).not.toHaveBeenCalled();
});

it("processes every identifier batch and retains matches after the first 500 orders and fulfillments", async () => {
  const f = fixture({ fulfillment_stage: "shipped" });
  const ownedIds = Array.from({ length: 501 }, (_, index) => `order_batch_${index}`);
  f.graph.mockImplementation(async ({ entity, filters }) => {
    if (entity === "order_seller") return { data: ownedIds.map((order_id) => ({ order_id })) } as never;
    if (entity === "order_fulfillment") {
      const ids = filters.order_id as string[];
      expect(ids.length).toBeLessThanOrEqual(500);
      return { data: ids.flatMap((order_id) => order_id === "order_batch_500"
        ? Array.from({ length: 501 }, (_, index) => ({ order_id, fulfillment_id: `ful_batch_${index}` }))
        : []) } as never;
    }
    const ids = filters.id as string[];
    expect(ids.length).toBeLessThanOrEqual(500);
    return { data: filters.$or && ids.includes("ful_batch_500") ? [{ id: "ful_batch_500" }] : [] } as never;
  });
  await processRequest(f.req, f.res);
  expect(f.req.filterableFields.id).toEqual(["order_batch_500"]);
  expect(f.graph.mock.calls.filter(([input]) => input.entity === "order_fulfillment")).toHaveLength(2);
  expect(f.graph.mock.calls.filter(([input]) => input.entity === "fulfillment")).toHaveLength(4);
});
