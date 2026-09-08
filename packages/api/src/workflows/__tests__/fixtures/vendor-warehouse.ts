import type { WarehouseRecord } from "../../../modules/vendor-onboarding/service";

export function warehouseFixture(options: { loseCreateResponse?: boolean; loseLinkResponse?: boolean; inventory?: boolean } = {}) {
  const claims: WarehouseRecord[] = [];
  const locations: Record<string, unknown>[] = [];
  let links: { seller_id: string; stock_location_id: string }[] = [];
  const onboarding = {
    listVendorWarehouses: jest.fn(async (filter) => claims.filter(claim => Object.entries(filter).every(([key, value]) => claim[key] === value))),
    claimWarehouse: jest.fn(async (input) => {
      const previous = claims.find(claim => claim.seller_id === input.seller_id);
      if (previous) return structuredClone(previous);
      const claim = { ...input, state: "provisioning", created_at: new Date(), updated_at: new Date(), deleted_at: null };
      claims.push(claim);
      return structuredClone(claim);
    }),
    updateVendorWarehouses: jest.fn(async (input) => { Object.assign(claims.find(claim => claim.id === input.id)!, input); }),
  };
  const stock = {
    listStockLocations: jest.fn(async ({ id }) => structuredClone(locations.filter(location => location.id === id))),
    createStockLocations: jest.fn(async (input) => {
      if (locations.some(location => location.id === input.id)) throw new Error("duplicate primary key");
      locations.push(structuredClone(input));
      if (options.loseCreateResponse) throw new Error("response lost");
      return structuredClone(input);
    }),
    deleteStockLocations: jest.fn(async id => { const index = locations.findIndex(location => location.id === id); if (index >= 0) locations.splice(index, 1); }),
  };
  const link = {
    create: jest.fn(async (input) => {
      const row = { seller_id: input.seller.seller_id, stock_location_id: input.stock_location.stock_location_id };
      if (links.some(link => link.stock_location_id === row.stock_location_id)) throw new Error("duplicate link");
      links.push(row);
      if (options.loseLinkResponse) throw new Error("link response lost");
    }),
    dismiss: jest.fn(async input => { links = links.filter(link => link.stock_location_id !== input.stock_location.stock_location_id); }),
  };
  const graph = async ({ entity, filters }: { entity: string; filters?: Record<string, unknown> }) => {
    if (entity === "stock_location_seller") return links.filter(link => Object.entries(filters || {}).every(([key, value]) => link[key] === value));
    if (entity === "stock_location") return locations.filter(location => location.id === filters?.id);
    if (entity === "inventory_level") return options.inventory ? [{ id: "ilev_existing" }] : [];
    return [];
  };
  return { onboarding, stock, link, graph, claims, locations, get links() { return links; } };
}
