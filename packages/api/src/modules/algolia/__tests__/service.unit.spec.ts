import { algoliasearch } from "algoliasearch";
import AlgoliaModuleService from "../service";
import { getAlgoliaConfiguration } from "../configuration";

jest.mock("algoliasearch", () => ({ algoliasearch: jest.fn() }));

test("keeps checkout available without an Algolia key and validates enabled configuration", () => {
  expect(getAlgoliaConfiguration({ ALGOLIA_APP_ID: "application" })).toBeNull();
  expect(() => getAlgoliaConfiguration({ ALGOLIA_API_KEY: "private" })).toThrow(
    "ALGOLIA_APP_ID",
  );
  expect(() =>
    getAlgoliaConfiguration({
      ALGOLIA_APP_ID: "application",
      ALGOLIA_API_KEY: "private",
      ALGOLIA_PRODUCT_INDEX: "*",
    }),
  ).toThrow("ALGOLIA_PRODUCT_INDEX");
});

test("configures namespaced sort replicas and waits for all indexing tasks", async () => {
  const client = {
    setSettings: jest.fn().mockResolvedValue({ taskID: 1 }),
    waitForTask: jest.fn().mockResolvedValue({}),
  };
  jest
    .mocked(algoliasearch)
    .mockReturnValue(client as unknown as ReturnType<typeof algoliasearch>);
  const service = new AlgoliaModuleService(
    {},
    { appId: "app", apiKey: "key", productIndex: "dev_products" },
  );
  await service.configure();
  expect(client.setSettings).toHaveBeenCalledTimes(4);
  expect(client.setSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      indexName: "dev_products",
      indexSettings: expect.objectContaining({
        replicas: [
          "dev_products_price_asc",
          "dev_products_price_desc",
          "dev_products_newest",
        ],
      }),
    }),
  );
  expect(client.setSettings).toHaveBeenCalledWith(
    expect.objectContaining({
      indexName: "dev_products_price_desc",
      indexSettings: expect.objectContaining({
        ranking: expect.arrayContaining(["desc(price)"]),
      }),
    }),
  );
  expect(client.waitForTask).toHaveBeenCalledTimes(4);
});

test("reconciliation removes obsolete seller scopes by objectID, not product ID", async () => {
  const client = {
    browseObjects: jest.fn(async ({ aggregator }) =>
      aggregator({
        hits: [
          { id: "prod_a", objectID: "prod_a:all" },
          { id: "prod_a", objectID: "prod_a:sel_closed" },
          { id: "prod_deleted", objectID: "prod_deleted:all" },
        ],
      }),
    ),
    batch: jest.fn().mockResolvedValue({ taskID: 1 }),
    waitForTask: jest.fn().mockResolvedValue({}),
  };
  jest
    .mocked(algoliasearch)
    .mockReturnValue(client as unknown as ReturnType<typeof algoliasearch>);
  const service = new AlgoliaModuleService(
    {},
    { appId: "app", apiKey: "key", productIndex: "dev_products" },
  );
  await service.reconcile(new Set(["prod_a:all"]));
  expect(client.batch).toHaveBeenCalledWith({
    indexName: "dev_products",
    batchWriteParams: {
      requests: [
        { action: "deleteObject", body: { objectID: "prod_a:sel_closed" } },
        { action: "deleteObject", body: { objectID: "prod_deleted:all" } },
      ],
    },
  });
});
