import { guardSellerShipping } from "../vendor-shipping/native-guards";
import { requireSellerWarehouse } from "../vendor-warehouse/access";

jest.mock("../vendor-warehouse/access", () => ({ requireSellerWarehouse: jest.fn() }));

function fixture(route: string, method = "GET", foreignSet = false, foreignZone = false) {
  const graph = jest.fn(async ({ entity, filters }) => ({
    data: entity === "location_fulfillment_set"
      ? [{ stock_location_id: foreignSet ? "loc_other" : "loc_own" }]
      : foreignZone || filters.fulfillment_set_id !== "set_own" ? [] : [{ id: "zone_own" }],
  }));
  const request = { originalUrl: route, method, scope: { resolve: () => ({ graph }) } };
  return { request, graph };
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(requireSellerWarehouse).mockResolvedValue("loc_own");
});

describe("native vendor shipping configuration guard", () => {
  it.each([
    ["POST", "/vendor/shipping-profiles"],
    ["POST", "/vendor/shipping-profiles/profile_own"],
    ["POST", "/vendor/shipping-options"],
    ["POST", "/vendor/shipping-options/option_own"],
    ["POST", "/vendor/shipping-options/option_own/rules/batch"],
    ["POST", "/vendor/shipping-option-types"],
    ["DELETE", "/vendor/fulfillment-sets/set_own"],
    ["POST", "/vendor/fulfillment-sets/set_own/service-zones"],
    ["POST", "/vendor/fulfillment-sets/set_own/service-zones/zone_own"],
    ["POST", "/vendor/stock-locations/loc_own/fulfillment-sets"],
    ["POST", "/vendor/stock-locations/loc_own/fulfillment-providers"],
    ["POST", "/vendor/stock-locations/loc_own/sales-channels/?fields=id"],
  ])("blocks %s %s before native workflows can bypass US/USD and ownership policy", async (method, route) => {
    const { request, graph } = fixture(route, method);
    await expect(guardSellerShipping(request as never, "seller_own")).rejects.toMatchObject({ status: 403, code: "shipping_configuration_required" });
    expect(graph).not.toHaveBeenCalled();
    expect(requireSellerWarehouse).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", "/vendor/shipping-configuration"],
    ["POST", "/vendor/shipping-configuration/profile_own"],
    ["POST", "/vendor/offers"],
    ["GET", "/vendor/shipping-options"],
    ["GET", "/vendor/shipping-profiles"],
    ["OPTIONS", "/vendor/fulfillment-sets/set_own"],
  ])("preserves %s %s without additional queries", async (method, route) => {
    const { request, graph } = fixture(route, method);
    await guardSellerShipping(request as never, "seller_own");
    expect(graph).not.toHaveBeenCalled();
    expect(requireSellerWarehouse).not.toHaveBeenCalled();
  });

  it("allows an owned zone only through its own fulfillment set and sole warehouse", async () => {
    const { request, graph } = fixture("/vendor/fulfillment-sets/set_own/service-zones/zone_own");
    await guardSellerShipping(request as never, "seller_own");
    expect(requireSellerWarehouse).toHaveBeenCalledWith(request.scope, "seller_own");
    expect(graph).toHaveBeenLastCalledWith(expect.objectContaining({ entity: "service_zone", filters: { id: "zone_own", fulfillment_set_id: "set_own" } }), { cache: { enable: false } });
  });

  it("rejects another seller's fulfillment set before looking up the zone", async () => {
    const { request, graph } = fixture("/vendor/fulfillment-sets/set_other/service-zones/zone_other", "GET", true);
    await expect(guardSellerShipping(request as never, "seller_own")).rejects.toMatchObject({ status: 404 });
    expect(graph).toHaveBeenCalledTimes(1);
  });

  it.each(["GET", "HEAD"])("rejects %s of a foreign zone under an owned parent", async method => {
    const { request } = fixture("/vendor/fulfillment-sets/set_own/service-zones/zone_other", method, false, true);
    await expect(guardSellerShipping(request as never, "seller_own")).rejects.toMatchObject({ status: 404 });
  });

  it("fails closed when warehouse ownership is ambiguous", async () => {
    jest.mocked(requireSellerWarehouse).mockRejectedValue(new Error("warehouse_conflict"));
    const { request, graph } = fixture("/vendor/fulfillment-sets/set_own");
    await expect(guardSellerShipping(request as never, "seller_own")).rejects.toThrow("warehouse_conflict");
    expect(graph).not.toHaveBeenCalled();
  });

  it.each(["shipping-profiles", "shipping-options"])("allows deleting owned %s but rejects a foreign resource", async resource => {
    const { request, graph } = fixture(`/vendor/${resource}/resource_own`, "DELETE");
    graph.mockResolvedValueOnce({ data: [{ seller_id: "seller_own" }] } as never);
    await guardSellerShipping(request as never, "seller_own");
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({ filters: expect.objectContaining({ seller_id: "seller_own" }) }), { cache: { enable: false } });
    graph.mockResolvedValueOnce({ data: [] });
    await expect(guardSellerShipping(request as never, "seller_other")).rejects.toMatchObject({ status: 404 });
  });
});
