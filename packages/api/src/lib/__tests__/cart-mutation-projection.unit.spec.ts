import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";

type GraphInput = { entity: string; fields: string[]; filters: { id: string } };
type Request = Record<string, unknown> & { queryConfig?: { fields: string[] } };
type Middleware = (req: Request, res: object, next: (error?: unknown) => void) => Promise<void>;
type Response = { status: jest.Mock; json: jest.Mock };
const packageRoot = path.dirname(require.resolve("@mercurjs/core/package.json"));
const cartDirectory = path.join(packageRoot, ".medusa/server/src/api/store/carts");
const nativeRequire = createRequire(path.join(cartDirectory, "middlewares.js"));
const runWorkflow = jest.fn();
const nativeHelpers = nativeRequire("./helpers") as { defaultStoreCartFields: string[] };

function loadNative<T>(file: string, replacements: Record<string, unknown> = {}): T {
  const exports = {};
  const localRequire = createRequire(file);
  runInNewContext(readFileSync(file, "utf8"), {
    exports,
    require: (id: string) => Object.prototype.hasOwnProperty.call(replacements, id) ? replacements[id] : localRequire(id),
  });
  return exports as T;
}

const { storeCartsMiddlewares } = loadNative<{
  storeCartsMiddlewares: { matcher: string; middlewares: Middleware[] }[];
}>(path.join(cartDirectory, "middlewares.js"), {
  "../../../utils/disable-medusa-middlewares": { ORIGINAL_MIDDLEWARES: {} },
});
const { POST } = loadNative<{ POST(req: Request, res: Response): Promise<void> }>(
  path.join(cartDirectory, "[id]/line-items/route.js"),
  { "@medusajs/medusa/core-flows": { addToCartWorkflow: () => ({ run: runWorkflow }) } },
);

function fixture(query: Record<string, unknown> = {}) {
  const graph = jest.fn(async (input: GraphInput) => ({
    data: input.entity === "offer"
      ? [{ id: "offer_1", variant_id: "variant_1" }]
      : [{ id: "cart_1", currency_code: "usd", items: [{ id: "cali_1", quantity: 3 }] }],
  }));
  const request: Request = {
    params: { id: "cart_1" },
    query,
    body: { offer_id: "offer_1", quantity: 1, metadata: { source: "product" } },
    scope: { resolve: () => ({ graph }) },
  };
  const response: Response = { status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  return { request, response, graph };
}

async function validate(request: Request) {
  const route = storeCartsMiddlewares.find(({ matcher }) => matcher === "/store/carts/:id/line-items");
  expect(route).toBeDefined();
  for (const middleware of route!.middlewares) {
    let error: unknown;
    await middleware(request, {}, (value) => { error = value; });
    if (error) throw error;
  }
}

beforeEach(() => {
  runWorkflow.mockReset().mockResolvedValue({});
});

describe("native add-to-cart response projection", () => {
  it("retrieves only requested receipt fields after the unchanged native mutation", async () => {
    const fields = ["id", "currency_code", "items.id", "items.quantity"];
    const { request, response, graph } = fixture({ fields: fields.join(",") });
    await validate(request);
    await POST(request, response);

    expect(runWorkflow).toHaveBeenCalledTimes(1);
    expect(runWorkflow).toHaveBeenCalledWith({ input: {
      cart_id: "cart_1",
      items: [{ quantity: 1, variant_id: "variant_1", offer_id: "offer_1", requires_shipping: true,
        metadata: { source: "product", offer_id: "offer_1" } }],
      additional_data: undefined,
    } });
    expect(graph).toHaveBeenCalledTimes(2);
    expect(graph).toHaveBeenLastCalledWith({ entity: "cart", fields, filters: { id: "cart_1" } });
    expect(response.json).toHaveBeenCalledWith({ cart: { id: "cart_1", currency_code: "usd", items: [{ id: "cali_1", quantity: 3 }] } });
  });

  it("preserves the full native cart response when fields are omitted", async () => {
    const { request, response, graph } = fixture();
    await validate(request);
    await POST(request, response);
    expect(new Set(graph.mock.calls[1][0].fields)).toEqual(new Set(nativeHelpers.defaultStoreCartFields));
  });

  it("does not retrieve a success response when native inventory or pricing validation fails", async () => {
    const { request, response, graph } = fixture({ fields: "id,items.quantity" });
    await validate(request);
    runWorkflow.mockRejectedValue(new Error("Insufficient inventory"));
    await expect(POST(request, response)).rejects.toThrow("Insufficient inventory");
    expect(graph).toHaveBeenCalledTimes(1);
    expect(response.json).not.toHaveBeenCalled();
  });

  it("retains native cart field restrictions against pivoting into other customers' orders", async () => {
    const { request, response, graph } = fixture({ fields: "id,customer.orders.*,region.orders.*" });
    await validate(request);
    await POST(request, response);
    expect(graph.mock.calls[1][0].fields).toEqual(["id"]);
  });

  it("rejects invalid query input before performing an offer query or mutation", async () => {
    const { request, graph } = fixture({ fields: { invalid: true } });
    await expect(validate(request)).rejects.toThrow();
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(graph).not.toHaveBeenCalled();
  });
});
