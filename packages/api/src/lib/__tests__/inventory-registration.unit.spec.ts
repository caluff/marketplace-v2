import path from "node:path";
import { createRequire } from "node:module";
import { asValue } from "@medusajs/framework/awilix";
import { MikroORM } from "@medusajs/framework/mikro-orm/postgresql";
import type { Constructor, MedusaContainer, ModuleLoaderFunction, ModuleResolution } from "@medusajs/framework/types";
import { createMedusaContainer, Modules } from "@medusajs/framework/utils";
import inventoryModule from "../../modules/inventory";
import { InventoryLevelRepository, ReservationItemRepository } from "../../modules/inventory/repositories/inventory-repositories";

// Use the framework's installed SDK instance; a hoisted transitive copy can have
// a different MikroORM metadata registry even when the version strings match.
const sdkRequire = createRequire(require.resolve("@medusajs/framework/modules-sdk"));
const { loadResources } = jest.requireActual<{
  loadResources: (options: {
    container: MedusaContainer;
    moduleResolution: ModuleResolution;
    discoveryPath: string;
    loadedModuleLoaders?: ModuleLoaderFunction[];
  }) => Promise<{
    models: Constructor<object>[];
    repositories: unknown[];
    loaders: ModuleLoaderFunction[];
  }>;
}>(
  sdkRequire.resolve("@medusajs/modules-sdk/dist/loaders/utils/load-internal"),
);

it("discovers native models/services and registers the locking repositories without connecting to a database", async () => {
  const container = createMedusaContainer();
  const resources = await loadResources({
    container,
    moduleResolution: { definition: { key: Modules.INVENTORY } } as never,
    discoveryPath: path.resolve(__dirname, "../../modules/inventory/index.ts"),
    loadedModuleLoaders: inventoryModule.loaders,
  });
  expect(resources.models.map(model => model.name).sort()).toEqual(["InventoryItem", "InventoryLevel", "ReservationItem"]);
  expect(resources.repositories).toEqual(expect.arrayContaining([InventoryLevelRepository, ReservationItemRepository]));
  const orm = await MikroORM.init({ entities: resources.models, dbName: "inventory_offline_unit", connect: false });
  try {
    container.register("manager", asValue(orm.em));
    const loader = resources.loaders.find(entry => entry.name === "containerLoader")!;
    await loader({ container } as never);
    expect(container.resolve("inventoryLevelRepository")).toBeInstanceOf(InventoryLevelRepository);
    expect(container.resolve("reservationItemRepository")).toBeInstanceOf(ReservationItemRepository);
    expect(container.resolve("inventoryItemService")).toBeDefined();
    expect(container.resolve("reservationItemService")).toBeDefined();
    const service = new inventoryModule.service(container.cradle);
    expect(service.__joinerConfig().serviceName).toBe(Modules.INVENTORY);
    expect(service.compareAndSetInventory).toBeInstanceOf(Function);
  } finally {
    await orm.close();
  }
}, 15000);
