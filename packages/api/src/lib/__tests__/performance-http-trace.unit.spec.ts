import { EventEmitter } from "node:events";
import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer } from "@medusajs/framework/utils";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import type { MedusaContainer } from "@medusajs/framework/types";
import { performanceTrace } from "../performance/http-trace";

const previousFlag = process.env.PERFORMANCE_TRACE_ENABLED;
afterEach(() => {
  if (previousFlag === undefined) delete process.env.PERFORMANCE_TRACE_ENABLED;
  else process.env.PERFORMANCE_TRACE_ENABLED = previousFlag;
});

function fixture() {
  const logger = { info: jest.fn() };
  const query = {
    marker: "bound instance",
    graph: jest.fn(async function (this: { marker: string }) { return { marker: this.marker }; }),
    index: jest.fn(async () => ({ data: [] })),
  };
  const root = createMedusaContainer();
  root.register({ logger: asValue(logger), query: asValue(query) });
  const scope = root.createScope() as MedusaContainer;
  const req = { scope, method: "GET", requestId: "not-a-uuid-secret", route: { path: "/vendor/products/:id" }, originalUrl: "/vendor/products/private?token=secret", body: { password: "secret" } } as unknown as MedusaRequest;
  const res = Object.assign(new EventEmitter(), { setHeader: jest.fn(), statusCode: 200, writableFinished: false }) as unknown as MedusaResponse;
  return { req, res, root, logger, query, next: jest.fn() };
}

it("is completely inert while disabled", () => {
  delete process.env.PERFORMANCE_TRACE_ENABLED;
  const f = fixture();
  performanceTrace(f.req, f.res, f.next);
  expect(f.next).toHaveBeenCalledTimes(1);
  expect(f.res.setHeader).not.toHaveBeenCalled();
  expect(f.req.scope.resolve("query")).toBe(f.query);
  expect(f.res.listenerCount("finish")).toBe(0);
});

it("correlates bounded redacted HTTP/query timings without mutating the singleton", async () => {
  process.env.PERFORMANCE_TRACE_ENABLED = "true";
  const f = fixture();
  performanceTrace(f.req, f.res, f.next);
  const scoped = f.req.scope.resolve("query");
  expect(scoped).not.toBe(f.query);
  expect(f.root.resolve("query")).toBe(f.query);
  expect(await scoped.graph({ entity: "product", fields: ["id"], filters: { id: "private" } })).toEqual({ marker: "bound instance" });
  await scoped.graph({ entity: "product", fields: ["id"] });
  await scoped.index({ entity: "seller", fields: ["id"] });
  f.res.emit("finish");
  f.res.emit("close");
  expect(f.logger.info).toHaveBeenCalledTimes(1);
  const message = f.logger.info.mock.calls[0][0];
  expect(message).not.toContain("secret");
  expect(message).not.toContain("private");
  const trace = JSON.parse(message);
  expect(trace).toMatchObject({ type: "performance.http", route: "/vendor/products/:id", aborted: false, status: 200 });
  expect(trace.query_groups).toEqual([
    expect.objectContaining({ operation: "graph", entity: "product", calls: 2, completed: 2, errors: 0 }),
    expect.objectContaining({ operation: "index", entity: "seller", calls: 1, completed: 1, errors: 0 }),
  ]);
  expect(f.res.setHeader).toHaveBeenCalledWith("X-Request-Id", trace.request_id);
  expect(f.res.listenerCount("finish") + f.res.listenerCount("close")).toBe(0);
});

it("preserves query failures without logging their potentially sensitive messages", async () => {
  process.env.PERFORMANCE_TRACE_ENABLED = "true";
  const f = fixture();
  f.query.graph.mockRejectedValueOnce(new Error("secret SQL payload"));
  performanceTrace(f.req, f.res, f.next);
  await expect(f.req.scope.resolve("query").graph({ entity: "product", fields: ["id"] })).rejects.toThrow("secret SQL payload");
  f.res.emit("close");
  const message = f.logger.info.mock.calls[0][0];
  expect(message).not.toContain("secret");
  expect(JSON.parse(message)).toMatchObject({ aborted: true, query_groups: [expect.objectContaining({ errors: 1, completed: 1 })] });
});

it("isolates concurrent request counters and omits untrusted route values", async () => {
  process.env.PERFORMANCE_TRACE_ENABLED = "true";
  const a = fixture();
  const b = fixture();
  b.req.route.path = "/vendor/products?token=secret";
  performanceTrace(a.req, a.res, a.next);
  performanceTrace(b.req, b.res, b.next);
  await a.req.scope.resolve("query").graph({ entity: "product", fields: ["id"] });
  a.res.emit("finish");
  b.res.emit("finish");
  expect(JSON.parse(a.logger.info.mock.calls[0][0]).query_groups).toHaveLength(1);
  expect(JSON.parse(b.logger.info.mock.calls[0][0])).toMatchObject({ route: "unmatched", query_groups: [] });
});

it("does not let a failing logger crash response completion", () => {
  process.env.PERFORMANCE_TRACE_ENABLED = "true";
  const f = fixture();
  f.logger.info.mockImplementation(() => { throw new Error("logger closed"); });
  performanceTrace(f.req, f.res, f.next);
  expect(() => f.res.emit("finish")).not.toThrow();
  expect(f.next).toHaveBeenCalledTimes(1);
});
