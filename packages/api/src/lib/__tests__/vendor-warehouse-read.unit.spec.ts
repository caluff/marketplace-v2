import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer, PolicyOperation } from "@medusajs/framework/utils";
import type { MedusaResponse } from "@medusajs/framework/http";
import { sellerWarehouseView } from "../vendor-warehouse/read";
import { GET } from "../../api/vendor/warehouse/route";
import { VendorWarehouseQuery, vendorWarehouseMiddlewares } from "../../api/vendor/warehouse/middlewares";

function fixture() {
  const sellerId = "seller_own";
  const location = { id: "sloc_own", name: "Warehouse", address: { address_1: "123 Main", city: "Miami", postal_code: "33101", country_code: "us" } };
  const claims = [{ seller_id: sellerId, stock_location_id: location.id, state: "ready" }];
  const links = [{ seller_id: sellerId, stock_location_id: location.id }];
  const locations = [location];
  const listVendorWarehouses = jest.fn(async () => claims);
  const graph = jest.fn(async ({ entity, filters }: { entity: string; filters: Record<string, string> }, _options?: { cache: { enable: boolean } }) => {
    void _options;
    if (entity === "stock_location") return { data: locations.filter((row) => row.id === filters.id) };
    if (entity === "stock_location_seller") return { data: links.filter((row) => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value)) };
    throw new Error(`Unexpected query: ${entity}`);
  });
  const container = createMedusaContainer();
  container.register({
    vendorOnboarding: asValue({ listVendorWarehouses }),
    query: asValue({ graph }),
  });
  return { sellerId, location, claims, links, locations, listVendorWarehouses, graph, container };
}

describe("approved warehouse projection", () => {
  it("returns the projected address after fresh claim, existence and exclusive ownership checks", async () => {
    const f = fixture();
    expect(await sellerWarehouseView(f.container, f.sellerId)).toEqual({ stock_location: f.location });
    expect(f.listVendorWarehouses).toHaveBeenCalledTimes(1);
    expect(f.listVendorWarehouses).toHaveBeenCalledWith({ seller_id: f.sellerId, state: "ready" });
    expect(f.graph).toHaveBeenCalledTimes(4);
    expect(f.graph).toHaveBeenLastCalledWith({ entity: "stock_location", filters: { id: f.location.id }, fields: ["id", "name", "address.*"] }, { cache: { enable: false } });
    for (const call of f.graph.mock.calls) expect(call[1]).toEqual({ cache: { enable: false } });
  });

  it.each(["missing_claim", "second_claim", "missing_link", "second_link", "foreign_owner", "missing_location"])("does not return a warehouse for %s", async (failure) => {
    const f = fixture();
    if (failure === "missing_claim") f.claims.length = 0;
    if (failure === "second_claim") f.claims.push({ ...f.claims[0] });
    if (failure === "missing_link") f.links.length = 0;
    if (failure === "second_link") f.links.push({ seller_id: f.sellerId, stock_location_id: "sloc_extra" });
    if (failure === "foreign_owner") f.links.push({ seller_id: "seller_foreign", stock_location_id: f.location.id });
    if (failure === "missing_location") f.locations.length = 0;
    await expect(sellerWarehouseView(f.container, f.sellerId)).rejects.toMatchObject({ status: 409 });
    expect(f.graph.mock.calls.some(([query]) => "fields" in query && Array.isArray(query.fields) && query.fields.includes("address.*"))).toBe(false);
  });

  it("checks current ownership again on the next request instead of retaining the granted access", async () => {
    const f = fixture();
    await sellerWarehouseView(f.container, f.sellerId);
    f.links.push({ seller_id: "seller_foreign", stock_location_id: f.location.id });
    await expect(sellerWarehouseView(f.container, f.sellerId)).rejects.toMatchObject({ code: "warehouse_conflict" });
  });

  it("uses the authenticated seller context and does not accept query overrides", async () => {
    const f = fixture();
    const json = jest.fn();
    const setHeader = jest.fn();
    await GET({ scope: f.container, seller_context: { seller_id: f.sellerId }, query: { seller_id: "seller_foreign", location_id: "sloc_foreign" } } as unknown as Parameters<typeof GET>[0], { json, setHeader } as unknown as MedusaResponse);
    expect(json).toHaveBeenCalledWith({ stock_location: f.location });
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(VendorWarehouseQuery.safeParse({}).success).toBe(true);
    expect(VendorWarehouseQuery.safeParse({ seller_id: "seller_foreign" }).success).toBe(false);
    expect(VendorWarehouseQuery.safeParse({ fields: "*" }).success).toBe(false);
    expect(vendorWarehouseMiddlewares[0].policies).toEqual([{ resource: "stock_location", operation: PolicyOperation.read }]);
  });
});
