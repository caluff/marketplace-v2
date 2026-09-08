import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer } from "@medusajs/framework/utils";
import type { MedusaRequest } from "@medusajs/framework/http";
import { warehouseFixture } from "./fixtures/vendor-warehouse";
import { provisionVendorWarehouse, reconcileVendorWarehouse } from "../steps/provision-vendor-warehouse";
import { requireSellerWarehouse, assertSellerWarehouseLocations } from "../../lib/vendor-warehouse/access";
import { guardSellerWarehouse } from "../../lib/vendor-warehouse/native-guards";
import { backfillVendorWarehouseWorkflow } from "../backfill-vendor-warehouse";

const data = {
  responsible: { first_name: "Jane", last_name: "Buyer", phone: "+12025550123" },
  store: { name: "Small Studio", handle: "small-studio", description: "Handmade pieces from our small studio.", website_url: "" },
  activity: { business_type: "individual", company_name: "", business_address: { address_1: "1 Main Street", address_2: "", city: "Washington", province: "DC", postal_code: "20001", country_code: "us" }, currency_code: "usd", category_ids: ["pcat_craft"], description: "Handmade home goods" },
};
const input = { application_id: "vapp_one", operation_id: "vappmut_one", seller_id: "sel_one" };

function fixture(options: Parameters<typeof warehouseFixture>[0] = {}) {
  const warehouse = warehouseFixture(options);
  const application = { id: input.application_id, approval_operation_id: input.operation_id, status: "approved", approval_state: "complete", submission_revision: 1, submitted_data: structuredClone(data), data: { deliberately: "not the approved revision" } };
  const onboarding = { ...warehouse.onboarding, retrieveVendorApplication: jest.fn(async () => application), listVendorApplications: jest.fn(async () => [application]) };
  const container = createMedusaContainer();
  container.register({ vendorOnboarding: asValue(onboarding), stock_location: asValue(warehouse.stock), link: asValue(warehouse.link), query: asValue({ graph: jest.fn(async args => ({ data: args.entity === "seller" ? [{ id: input.seller_id }] : await warehouse.graph(args) })) }), logger: asValue({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) });
  return { container, warehouse, onboarding, application };
}

describe("authoritative seller warehouse", () => {
  it("pre-journals ownership and uses the approved snapshot with a US phone", async () => {
    const f = fixture();
    const id = await provisionVendorWarehouse(f.container, input);
    expect(f.warehouse.locations[0]).toMatchObject({ id, address: { ...data.activity.business_address, phone: data.responsible.phone } });
    expect(f.onboarding.claimWarehouse.mock.invocationCallOrder[0]).toBeLessThan(f.warehouse.stock.createStockLocations.mock.invocationCallOrder[0]);
    expect(await requireSellerWarehouse(f.container, input.seller_id)).toBe(id);
  });
  it("concurrent attempts and response loss converge to one claimed primary key", async () => {
    const f = fixture({ loseCreateResponse: true, loseLinkResponse: true });
    const results = await Promise.all([provisionVendorWarehouse(f.container, input), provisionVendorWarehouse(f.container, input)]);
    expect(results[0]).toBe(results[1]);
    expect(f.warehouse.locations).toHaveLength(1);
    expect(f.warehouse.claims).toHaveLength(1);
    expect(f.warehouse.links).toHaveLength(1);
    await provisionVendorWarehouse(f.container, input);
    expect(f.warehouse.locations).toHaveLength(1);
  });
  it("adopts one matching location and never deletes adopted inventory", async () => {
    const f = fixture({ inventory: true });
    f.warehouse.locations.push({ id: "sloc_existing", address: { ...data.activity.business_address, phone: data.responsible.phone } });
    f.warehouse.links.push({ seller_id: input.seller_id, stock_location_id: "sloc_existing" });
    expect(await provisionVendorWarehouse(f.container, input)).toBe("sloc_existing");
    expect(f.warehouse.stock.createStockLocations).not.toHaveBeenCalled();
    await expect(reconcileVendorWarehouse(f.container, input.operation_id)).rejects.toMatchObject({ code: "approval_recovery_required" });
    expect(f.warehouse.stock.deleteStockLocations).not.toHaveBeenCalled();
  });
  it("refuses to compensate an owned location once it has any inventory levels", async () => {
    const f = fixture({ inventory: true });
    await provisionVendorWarehouse(f.container, input);
    await expect(reconcileVendorWarehouse(f.container, input.operation_id)).rejects.toMatchObject({ code: "approval_recovery_required" });
    expect(f.warehouse.stock.deleteStockLocations).not.toHaveBeenCalled();
    expect(f.warehouse.claims[0].state).toBe("ready");
  });
  it("compensates only its own empty warehouse and keeps the released ownership journal", async () => {
    const f = fixture();
    await provisionVendorWarehouse(f.container, input);
    await reconcileVendorWarehouse(f.container, input.operation_id);
    await reconcileVendorWarehouse(f.container, input.operation_id);
    expect(f.warehouse.locations).toEqual([]);
    expect(f.warehouse.stock.deleteStockLocations).toHaveBeenCalledTimes(1);
    expect(f.warehouse.claims[0].state).toBe("released");
  });
  it("fails closed for foreign nested locations and a second linked warehouse", async () => {
    const f = fixture();
    const id = await provisionVendorWarehouse(f.container, input);
    await expect(assertSellerWarehouseLocations(f.container, input.seller_id, [id, "sloc_foreign"])).rejects.toMatchObject({ code: "inventory_scope_forbidden" });
    f.warehouse.links.push({ seller_id: input.seller_id, stock_location_id: "sloc_extra" });
    await expect(requireSellerWarehouse(f.container, input.seller_id)).rejects.toMatchObject({ code: "warehouse_not_ready" });
  });
  it("rejects a foreign owner even when the seller link and claim otherwise match", async () => {
    const f = fixture();
    const id = await provisionVendorWarehouse(f.container, input);
    f.warehouse.links.push({ seller_id: "sel_foreign", stock_location_id: id });
    await expect(requireSellerWarehouse(f.container, input.seller_id)).rejects.toMatchObject({ code: "warehouse_conflict" });
  });
  it("rejects non-US phones before reserving or creating resources", async () => {
    const f = fixture();
    f.application.submitted_data.responsible.phone = "+14165550123";
    await expect(provisionVendorWarehouse(f.container, input)).rejects.toMatchObject({ code: "invalid_application" });
    expect(f.onboarding.claimWarehouse).not.toHaveBeenCalled();
  });
  it("HTTP guards deny free creation and recursively check offer references", async () => {
    const f = fixture();
    await provisionVendorWarehouse(f.container, input);
    const req = (originalUrl: string, body = {}) => ({ originalUrl, method: "POST", body, scope: f.container }) as MedusaRequest;
    await expect(guardSellerWarehouse(req("/vendor/stock-locations"), input.seller_id)).rejects.toMatchObject({ code: "warehouse_managed_by_application" });
    await expect(guardSellerWarehouse(req("/vendor/offers", { offers: [{ inventory_items: [{ location_levels: [{ location_id: "sloc_foreign" }] }] }] }), input.seller_id)).rejects.toMatchObject({ code: "inventory_scope_forbidden" });
  });
  it("dry-run performs no mutations and reports multiple-location conflicts", async () => {
    const f = fixture();
    const run = () => backfillVendorWarehouseWorkflow(f.container).run({ input: { seller_id: input.seller_id, dry_run: true } });
    expect((await run()).result.status).toBe("would_create");
    f.warehouse.links.push({ seller_id: input.seller_id, stock_location_id: "one" }, { seller_id: input.seller_id, stock_location_id: "two" });
    expect((await run()).result).toMatchObject({ status: "conflict", reason: "multiple_warehouses" });
    expect(f.onboarding.claimWarehouse).not.toHaveBeenCalled();
    expect(f.warehouse.stock.createStockLocations).not.toHaveBeenCalled();
  });
  it("blocks inventory mutations without explicit location IDs until backfill is ready", async () => {
    const f = fixture();
    const req = { originalUrl: "/vendor/inventory-items/location-levels/batch", method: "POST", body: { delete: ["ilev_existing"] }, scope: f.container } as MedusaRequest;
    await expect(guardSellerWarehouse(req, input.seller_id)).rejects.toMatchObject({ code: "warehouse_not_ready" });
  });
  it("dry-run diagnoses an address conflict without modifying an operating location", async () => {
    const f = fixture();
    f.warehouse.links.push({ seller_id: input.seller_id, stock_location_id: "existing" });
    f.warehouse.locations.push({ id: "existing", address: { ...data.activity.business_address, phone: "+13055550123" } });
    const { result } = await backfillVendorWarehouseWorkflow(f.container).run({ input: { seller_id: input.seller_id, dry_run: true } });
    expect(result).toMatchObject({ status: "conflict", reason: "warehouse_address_conflict" });
    expect(f.onboarding.claimWarehouse).not.toHaveBeenCalled();
  });
});
