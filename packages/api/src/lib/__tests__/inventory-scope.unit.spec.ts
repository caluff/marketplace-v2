import { updateVendorStock } from "../inventory/update-vendor-stock";
import { requireVendorAccess } from "../vendor-onboarding/access";
import { updateVendorStockWorkflow } from "../../workflows/update-vendor-stock";
import { POST } from "../../api/vendor/inventory-adjustments/route";
import { vendorInventoryMiddlewares } from "../../api/vendor/inventory-adjustments/middlewares";

jest.mock("../vendor-onboarding/access", () => ({ requireVendorAccess: jest.fn() }));
jest.mock("../../workflows/update-vendor-stock", () => ({ updateVendorStockWorkflow: jest.fn() }));

const input = { member_id: "member_1", seller_id: "seller_1", inventory_item_id: "item_1", location_id: "loc_1", expected_quantity: 10, stocked_quantity: 12 };

function fixture(missing?: string) {
  const graph = jest.fn(async ({ entity }) => ({ data: missing === entity ? [] : [{ id: "linked" }] }));
  const compareAndSetInventory = jest.fn(async () => ({ id: "level_1", stocked_quantity: 12 }));
  const container = { resolve: (key: string) => key === "query" ? { graph } : { compareAndSetInventory } };
  return { container, graph, compareAndSetInventory };
}

beforeEach(() => jest.resetAllMocks());

describe("vendor inventory ownership", () => {
  it("checks active membership and both native seller links before mutation", async () => {
    const context = fixture();
    await updateVendorStock(context.container as never, input);
    expect(requireVendorAccess).toHaveBeenCalledWith(context.container, "member_1", "seller_1");
    expect(context.graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "inventory_item_seller", filters: { seller_id: "seller_1", inventory_item_id: "item_1" } }), { cache: { enable: false } });
    expect(context.graph).toHaveBeenCalledWith(expect.objectContaining({ entity: "stock_location_seller", filters: { seller_id: "seller_1", stock_location_id: "loc_1" } }), { cache: { enable: false } });
    expect(context.compareAndSetInventory).toHaveBeenCalledWith({ inventory_item_id: "item_1", location_id: "loc_1", expected_quantity: 10, stocked_quantity: 12 });
  });

  it.each(["inventory_item_seller", "stock_location_seller"])("does not mutate when the seller lacks %s ownership", async missing => {
    const context = fixture(missing);
    await expect(updateVendorStock(context.container as never, input)).rejects.toMatchObject({ type: "not_found" });
    expect(context.compareAndSetInventory).not.toHaveBeenCalled();
  });

  it("does not query or mutate inventory when current vendor authorization fails", async () => {
    jest.mocked(requireVendorAccess).mockRejectedValue(new Error("Member inactive or seller unavailable"));
    const context = fixture();
    await expect(updateVendorStock(context.container as never, input)).rejects.toThrow("Member inactive");
    expect(context.graph).not.toHaveBeenCalled();
    expect(context.compareAndSetInventory).not.toHaveBeenCalled();
  });

  it("validates workflow inputs independently of HTTP middleware", async () => {
    const context = fixture();
    await expect(updateVendorStock(context.container as never, { ...input, stocked_quantity: -1 })).rejects.toThrow();
    expect(context.compareAndSetInventory).not.toHaveBeenCalled();
  });
});

describe("inventory adjustment HTTP adapter", () => {
  it("pins identity to authentication and returns the committed native inventory level", async () => {
    const level = { id: "level_1", stocked_quantity: 12 };
    const run = jest.fn(async () => ({ result: level }));
    jest.mocked(updateVendorStockWorkflow).mockReturnValue({ run } as never);
    const json = jest.fn();
    const body = { ...input, member_id: "attacker", seller_id: "seller_other" };
    await POST({ validatedBody: body, auth_context: { actor_id: "member_1" }, get: () => "seller_1", scope: {} } as never, { json } as never);
    expect(run).toHaveBeenCalledWith({ input });
    expect(json).toHaveBeenCalledWith({ inventory_level: level });
  });

  it("propagates a transaction conflict instead of returning a success response", async () => {
    const conflict = Object.assign(new Error("Inventory changed"), { type: "conflict" });
    jest.mocked(updateVendorStockWorkflow).mockReturnValue({ run: jest.fn().mockRejectedValue(conflict) } as never);
    const json = jest.fn();
    await expect(POST({ validatedBody: input, auth_context: { actor_id: "member_1" }, get: () => "seller_1", scope: {} } as never, { json } as never)).rejects.toBe(conflict);
    expect(json).not.toHaveBeenCalled();
  });

  it("requires native inventory update permission and body validation", () => {
    expect(vendorInventoryMiddlewares[0]).toMatchObject({ matcher: "/vendor/inventory-adjustments", method: "POST", policies: [{ resource: "inventory_item", operation: "update" }] });
    expect(vendorInventoryMiddlewares[0].middlewares).toHaveLength(1);
  });
});
