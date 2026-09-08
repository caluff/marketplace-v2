import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { VendorShippingConfiguration } from "../../../api/vendor/shipping-configuration/validators";
import { shippingPolicy } from "../../../api/vendor/shipping-configuration/middlewares";
import {
  isUnitedStatesZone,
  shippingInfrastructurePlan,
  shippingProfileName,
  shippingSetName,
  validateShippingConfiguration,
} from "../configuration";
import { requireSellerWarehouse } from "../../vendor-warehouse/access";

jest.mock("../../vendor-warehouse/access", () => ({
  requireSellerWarehouse: jest.fn(),
}));

const zones = [{ type: "country", country_code: "us" }];
const update = {
  action: "update_option" as const,
  option_id: "so_1",
  name: "Estándar",
  description: "Entrega en 3 días",
  amount: 4.5,
  enabled: false,
};
function fixture() {
  const option = {
    id: "so_1",
    shipping_profile_id: "sp_1",
    provider_id: "manual_manual",
    price_type: "flat",
    metadata: { marketplace_v2_shipping: true },
    service_zone: { fulfillment_set_id: "fs_1", geo_zones: zones },
    type: { id: "type_1", code: "own-type" },
    rules: [],
  };
  const price = {
    id: "price_1",
    currency_code: "usd",
    min_quantity: null as number | null,
    max_quantity: null,
    price_rules: [] as object[],
  };
  const location = {
    id: "loc_1",
    fulfillment_sets: [] as object[],
    fulfillment_providers: [] as object[],
    sales_channels: [] as object[],
  };
  const records: Record<string, object[]> = {
    shipping_profile_seller: [{ seller_id: "seller_1" }],
    shipping_option_seller: [{ seller_id: "seller_1" }],
    location_fulfillment_set: [{ stock_location_id: "loc_1" }],
    shipping_option: [{ id: "so_1", prices: [price] }],
    stock_location: [location],
    fulfillment_provider: [{ id: "manual_manual", is_enabled: true }],
    store: [{ default_sales_channel_id: "sc_1" }],
  };
  const graph = jest.fn(async ({ entity }: { entity: string }) => ({
    data: records[entity] ?? [],
  }));
  const retrieveShippingOption = jest.fn(async () => option);
  const container = {
    resolve: (key: string) =>
      key === Modules.FULFILLMENT ? { retrieveShippingOption } : { graph },
  } as unknown as MedusaContainer;
  return { container, records, option, location, price, graph };
}

beforeEach(() => {
  jest.mocked(requireSellerWarehouse).mockResolvedValue("loc_1");
});

describe("vendor shipping configuration policy", () => {
  it.each([NaN, Infinity, -1, 0.001, 1_000_001])(
    "rejects invalid flat amount %s",
    (amount) => {
      expect(
        VendorShippingConfiguration.safeParse({ ...update, amount }).success,
      ).toBe(false);
    },
  );
  it("accepts free shipping and ordinary USD decimal values", () => {
    for (const amount of [0, 0.01, 4.5, 19.99])
      expect(
        VendorShippingConfiguration.safeParse({ ...update, amount }).success,
      ).toBe(true);
  });
  it("does not accept caller-selected warehouse, country, provider or currency", () => {
    for (const extra of [
      { country_code: "ca" },
      { currency_code: "eur" },
      { warehouse_id: "other" },
      { provider_id: "other" },
    ])
      expect(
        VendorShippingConfiguration.safeParse({ ...update, ...extra }).success,
      ).toBe(false);
  });
  it("checks the precise native permission for each action", () => {
    expect(
      shippingPolicy({ action: "create_profile", name: "General" }),
    ).toEqual({ resource: "shipping_profile", operation: "create" });
    expect(
      shippingPolicy({
        action: "update_profile",
        profile_id: "sp_1",
        name: "General",
      }),
    ).toEqual({ resource: "shipping_profile", operation: "update" });
    expect(
      shippingPolicy({
        action: "create_option",
        shipping_profile_id: "sp_1",
        name: "Standard",
        amount: 0,
        description: "",
      }),
    ).toEqual({ resource: "shipping_option", operation: "create" });
    expect(shippingPolicy(update)).toEqual({
      resource: "shipping_option",
      operation: "update",
    });
  });
  it("uses distinct native names for different sellers", () => {
    expect(shippingSetName("seller_1")).not.toBe(shippingSetName("seller_2"));
    expect(shippingProfileName("seller_1", "General")).not.toBe(
      shippingProfileName("seller_2", "General"),
    );
  });
  it("accepts only the complete United States country zone", () => {
    expect(isUnitedStatesZone(zones)).toBe(true);
    expect(isUnitedStatesZone([])).toBe(false);
    expect(
      isUnitedStatesZone([...zones, { type: "country", country_code: "ca" }]),
    ).toBe(false);
    expect(isUnitedStatesZone([{ type: "province", country_code: "us" }])).toBe(
      false,
    );
  });
});

describe("seller shipping ownership and edits", () => {
  it("rejects another seller's profile before preparing infrastructure", async () => {
    const f = fixture();
    f.records.shipping_profile_seller = [];
    await expect(
      validateShippingConfiguration(f.container, {
        seller_id: "seller_1",
        configuration: {
          action: "create_option",
          shipping_profile_id: "foreign",
          name: "Shipping",
          description: "",
          amount: 5,
        },
      }),
    ).rejects.toMatchObject({ type: "not_found" });
    expect(f.graph).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { seller_id: "seller_1", shipping_profile_id: "foreign" },
      }),
      expect.anything(),
    );
  });
  it("rejects another seller's option", async () => {
    const f = fixture();
    f.records.shipping_option_seller = [];
    await expect(
      validateShippingConfiguration(f.container, {
        seller_id: "seller_1",
        configuration: update,
      }),
    ).rejects.toMatchObject({ type: "not_found" });
  });
  it("keeps the native price ID when editing a simple managed option", async () => {
    const f = fixture();
    await expect(
      validateShippingConfiguration(f.container, {
        seller_id: "seller_1",
        configuration: update,
      }),
    ).resolves.toMatchObject({ price_id: "price_1", configuration: update });
  });
  it.each(["currency", "price_rules", "quantity", "unmanaged", "calculated"])(
    "does not overwrite advanced configuration: %s",
    async (mode) => {
      const f = fixture();
      if (mode === "currency") f.price.currency_code = "eur";
      if (mode === "price_rules") f.price.price_rules = [{ id: "rule_1" }];
      if (mode === "quantity") f.price.min_quantity = 2;
      if (mode === "unmanaged")
        f.option.metadata.marketplace_v2_shipping = false;
      if (mode === "calculated") f.option.price_type = "calculated";
      await expect(
        validateShippingConfiguration(f.container, {
          seller_id: "seller_1",
          configuration: update,
        }),
      ).rejects.toMatchObject({ type: "invalid_data" });
    },
  );
  it("rejects a shared fulfillment set even if one warehouse belongs to the seller", async () => {
    const f = fixture();
    f.records.location_fulfillment_set.push({ stock_location_id: "foreign" });
    await expect(
      validateShippingConfiguration(f.container, {
        seller_id: "seller_1",
        configuration: update,
      }),
    ).rejects.toMatchObject({ type: "invalid_data" });
  });
  it("does not change a description shared with another shipping option", async () => {
    const f = fixture();
    f.records.shipping_option.push({ id: "another_sellers_option" });
    await expect(
      validateShippingConfiguration(f.container, {
        seller_id: "seller_1",
        configuration: update,
      }),
    ).rejects.toMatchObject({ type: "invalid_data" });
    expect(f.graph).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { shipping_option_type_id: "type_1" },
        pagination: { take: 2 },
      }),
      expect.anything(),
    );
  });
});

describe("shipping infrastructure preparation", () => {
  it("plans native provider/channel links only when missing and reuses infrastructure on retry", async () => {
    const f = fixture();
    const first = await shippingInfrastructurePlan(f.container, "seller_1");
    expect(first.links).toHaveLength(2);
    expect(first.service_zone_id).toBeUndefined();
    f.location.fulfillment_sets = [
      {
        id: "fs_1",
        type: "shipping",
        name: shippingSetName("seller_1"),
        service_zones: [{ id: "zone_1", geo_zones: zones }],
      },
    ];
    f.location.fulfillment_providers = [{ id: "manual_manual" }];
    f.location.sales_channels = [{ id: "sc_1" }];
    const retry = await shippingInfrastructurePlan(f.container, "seller_1");
    expect(retry).toMatchObject({
      fulfillment_set_id: "fs_1",
      service_zone_id: "zone_1",
      links: [],
    });
  });
  it("does not adopt a shared fulfillment set", async () => {
    const f = fixture();
    f.location.fulfillment_sets = [{ id: "fs_1", type: "shipping" }];
    f.records.location_fulfillment_set.push({ stock_location_id: "foreign" });
    await expect(
      shippingInfrastructurePlan(f.container, "seller_1"),
    ).rejects.toMatchObject({ type: "not_allowed" });
  });
  it("fails before native writes when manual fulfillment is unavailable", async () => {
    const f = fixture();
    f.records.fulfillment_provider = [];
    await expect(
      shippingInfrastructurePlan(f.container, "seller_1"),
    ).rejects.toMatchObject({ type: "invalid_data" });
  });
});
