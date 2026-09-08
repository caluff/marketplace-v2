import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Medusa, { FetchError } from "@medusajs/js-sdk";
import type { SellerMemberDTO } from "@mercurjs/types";
import { scopedClient } from "../workspace/operations";
import { listInput } from "../workspace/presentation";
import {
  inventoryPage,
  sellerWarehouse,
  warehouseLevel,
  type InventoryItemWithLevels,
} from "./data";

const location = {
  id: "loc_approved",
  name: "Approved warehouse",
  address: {
    address_1: "123 Main St",
    city: "Miami",
    postal_code: "33101",
    country_code: "us",
  },
};
const level = {
  id: "ilevel_1",
  location_id: location.id,
  stocked_quantity: 12,
  reserved_quantity: 3,
};
const item = {
  id: "iitem_1",
  location_levels: [level],
} satisfies InventoryItemWithLevels;

function harness(respond: (path: string) => unknown) {
  const calls: {
    path: string;
    init: Parameters<Medusa["client"]["fetch"]>[1];
  }[] = [];
  const sdk = new Medusa({
    baseUrl: "https://api.example.invalid",
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
  });
  sdk.client.fetch = async <T>(
    path: Parameters<Medusa["client"]["fetch"]>[0],
    init?: Parameters<Medusa["client"]["fetch"]>[1],
  ): Promise<T> => {
    calls.push({ path: String(path), init });
    return (await respond(String(path))) as T;
  };
  return {
    calls,
    client: scopedClient({
      sdk,
      membership: {
        seller: { id: "seller_current", status: "open" },
        member: { is_active: true },
      } as SellerMemberDTO,
    }),
  };
}

describe("single approved warehouse reads", () => {
  it("loads the approved warehouse projection in one authenticated request", async () => {
    const context = harness(() => ({ stock_location: location }));
    assert.deepEqual(await sellerWarehouse(context.client), {
      status: "ready",
      location,
    });
    assert.equal(context.calls.length, 1);
    assert.equal(context.calls[0].path, "/vendor/warehouse");
    assert.equal(context.calls[0].init?.query, undefined);
    for (const call of context.calls) {
      assert.deepEqual(call.init?.headers, { "x-seller-id": "seller_current" });
      assert.equal(call.init?.cache, "no-store");
      assert.equal(call.init?.method, undefined);
    }
  });

  it("blocks an unverified claim or missing native detail and propagates auth/service errors", async () => {
    for (const status of [401, 403, 404, 409, 503]) {
      const failure = new FetchError("warehouse_not_ready", "Rejected", status);
      const context = harness(() => { throw failure; });
      if ([404, 409].includes(status))
        assert.deepEqual(await sellerWarehouse(context.client), {
          status: "conflict",
        });
      else
        await assert.rejects(
          sellerWarehouse(context.client),
          (error) => error === failure,
        );
      assert.equal(context.calls.length, 1);
    }
  });

  it("does not accept a missing ID, absent address or non-US location", async () => {
    for (const invalid of [
      { ...location, id: "" },
      { ...location, address: null },
      { ...location, address: { ...location.address, country_code: "uy" } },
    ]) {
      const context = harness(() => ({ stock_location: invalid }));
      assert.deepEqual(await sellerWarehouse(context.client), {
        status: "conflict",
      });
    }
  });
});

describe("bounded inventory reads", () => {
  it("loads 20 items and embedded levels plus canonical warehouse in exactly two parallel requests", async () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      ...item,
      id: `iitem_${index}`,
    }));
    const response = {
      inventory_items: items,
      count: 41,
      limit: 20,
      offset: 20,
    };
    const context = harness((path) =>
      path === "/vendor/inventory-items"
        ? response
        : { stock_location: location },
    );
    const [inventory, warehouse] = await Promise.all([
      inventoryPage(context.client, listInput({ page: "2", q: "Widget" })),
      sellerWarehouse(context.client),
    ]);
    assert.equal(inventory, response);
    assert.equal(warehouse.status, "ready");
    assert.equal(context.calls.length, 2);
    const query = context.calls.find(
      (call) => call.path === "/vendor/inventory-items",
    )!.init?.query;
    assert.equal(query?.limit, 20);
    assert.equal(query?.offset, 20);
    assert.equal(query?.q, "Widget");
    assert.match(String(query?.fields), /location_levels.stocked_quantity/);
    assert.ok(
      context.calls.every((call) => !call.path.includes("location-levels")),
    );
  });

  it("distinguishes unconfigured items from conflicting or foreign levels", () => {
    assert.equal(
      warehouseLevel({ ...item, location_levels: [] }, location.id).status,
      "missing",
    );
    for (const levels of [
      undefined,
      [level, level],
      [{ ...level, location_id: "loc_foreign" }],
      [{ ...level, stocked_quantity: null }],
      [{ ...level, reserved_quantity: -1 }],
    ]) {
      assert.equal(
        warehouseLevel(
          { ...item, location_levels: levels } as InventoryItemWithLevels,
          location.id,
        ).status,
        "conflict",
      );
    }
    const stock = warehouseLevel(item, location.id);
    assert.equal(stock.status, "ready");
    if (stock.status === "ready") assert.equal(stock.available, 9);
  });
});
