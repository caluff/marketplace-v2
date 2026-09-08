import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Medusa from "@medusajs/js-sdk";
import type { SellerMemberDTO } from "@mercurjs/types";
import {
  shippingConfiguration,
  shippingOperations,
  shippingOptionState,
  type ShippingOptionWithPrices,
} from "./operations";
import { scopedClient } from "../workspace/operations";
import { shippingProfileName } from "./presentation";

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

function harness(active = true) {
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
    return {
      success: true,
      shipping_profiles: [],
      shipping_options: [],
      stock_locations: [],
      count: 0,
    } as T;
  };
  const context = {
    sdk,
    membership: {
      seller: { id: "seller_current", status: "open" },
      member: { is_active: active },
    } as SellerMemberDTO,
  };
  return {
    calls,
    context,
    operations: shippingOperations(async () => context),
  };
}

describe("vendor shipping", () => {
  it("shows seller-facing profile names without exposing native uniqueness suffixes", () => {
    assert.equal(
      shippingProfileName({
        name: "General · seller_id",
        metadata: { marketplace_v2_display_name: "General" },
      }),
      "General",
    );
    assert.equal(
      shippingProfileName({ name: "Legacy", metadata: null }),
      "Legacy",
    );
  });
  it("pins mutations to the authenticated seller, allows free shipping and omits injected warehouse/country/currency", async () => {
    const h = harness();
    await h.operations.save(
      form({
        action: "create_option",
        name: "Estándar",
        description: "3 a 5 días",
        amount: "0",
        shipping_profile_id: "sp_1",
        seller_id: "other",
        country_code: "ca",
        currency_code: "eur",
        location_id: "other",
      }),
    );
    assert.deepEqual(h.calls[0].init?.headers, {
      "x-seller-id": "seller_current",
    });
    assert.deepEqual(h.calls[0].init?.body, {
      action: "create_option",
      name: "Estándar",
      description: "3 a 5 días",
      amount: 0,
      shipping_profile_id: "sp_1",
    });
    assert.equal(h.calls[0].path, "/vendor/shipping-configuration");
  });
  it("updates decimal display units and explicitly disables a rate", async () => {
    const h = harness();
    await h.operations.save(
      form({
        action: "update_option",
        option_id: "so_1",
        name: "Estándar",
        description: "3 a 5 días",
        amount: "4.95",
        enabled: "false",
      }),
    );
    assert.deepEqual(h.calls[0].init?.body, {
      action: "update_option",
      option_id: "so_1",
      name: "Estándar",
      description: "3 a 5 días",
      amount: 4.95,
      enabled: false,
    });
  });
  it("rejects invalid values and inactive membership before sending writes", async () => {
    const h = harness();
    const values = {
      action: "update_option",
      option_id: "so_1",
      name: "Estándar",
      description: "Entrega",
      amount: "5",
      enabled: "true",
    };
    for (const change of [
      { amount: "-1" },
      { amount: "0.001" },
      { amount: "1000000.01" },
      { enabled: "yes" },
      { action: "delete" },
      { option_id: "../another" },
      { name: "" },
    ])
      await assert.rejects(h.operations.save(form({ ...values, ...change })));
    assert.equal(h.calls.length, 0);
    const inactive = harness(false);
    await assert.rejects(
      inactive.operations.save(
        form({ action: "create_profile", name: "General" }),
      ),
      /membresía/,
    );
    assert.equal(inactive.calls.length, 0);
  });
  it("creates and renames profiles without accepting a seller override", async () => {
    const h = harness();
    await h.operations.save(
      form({ action: "create_profile", name: "General" }),
    );
    await h.operations.save(
      form({ action: "update_profile", name: "Frágiles", profile_id: "sp_1" }),
    );
    assert.deepEqual(
      h.calls.map((call) => call.init?.body),
      [
        { action: "create_profile", name: "General" },
        { action: "update_profile", name: "Frágiles", profile_id: "sp_1" },
      ],
    );
  });
  it("uses scoped no-store reads for profiles, options and the single warehouse", async () => {
    const h = harness();
    await shippingConfiguration(scopedClient(h.context));
    assert.equal(h.calls.length, 3);
    for (const call of h.calls) {
      assert.deepEqual(call.init?.headers, { "x-seller-id": "seller_current" });
      assert.equal(call.init?.cache, "no-store");
    }
  });
  it("uses checkout's enabled rule and refuses ambiguous or unmanaged prices", () => {
    const option = {
      price_type: "flat",
      metadata: { marketplace_v2_shipping: true },
      rules: [
        {
          attribute: "enabled_in_store",
          operator: "eq",
          value: { value: "true" },
        },
      ],
      prices: [
        { id: "price_1", currency_code: "usd", amount: 0, price_rules: [] },
      ],
    } as unknown as ShippingOptionWithPrices;
    assert.deepEqual(shippingOptionState(option), {
      editable: true,
      amount: "0",
      enabled: true,
    });
    assert.equal(
      shippingOptionState({
        ...option,
        rules: [{ ...option.rules[0], value: { value: "false" } }],
      }).enabled,
      false,
    );
    assert.equal(
      shippingOptionState({
        ...option,
        prices: [...option.prices!, ...option.prices!],
      }).editable,
      false,
    );
    assert.equal(
      shippingOptionState({ ...option, metadata: {} }).editable,
      false,
    );
    assert.equal(
      shippingOptionState({
        ...option,
        prices: [{ ...option.prices![0], min_quantity: 2 }],
      }).editable,
      false,
    );
    assert.equal(
      shippingOptionState({
        ...option,
        prices: [{ ...option.prices![0], price_rules: undefined }],
      }).editable,
      false,
    );
  });
});
