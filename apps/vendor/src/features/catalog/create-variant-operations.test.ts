import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogOperations } from "./operations";
import type { AuthorizedVendor } from "../workspace/operations";

function fixture() {
  const calls: { path: string; body: unknown; headers: unknown }[] = [];
  const authorized = {
    membership: {
      member: { is_active: true },
      seller: { id: "sel_owner", status: "open" },
    },
    sdk: {
      client: {
        async fetch(
          path: string,
          options: { method?: string; body?: unknown; headers?: unknown },
        ) {
          calls.push({ path, body: options.body, headers: options.headers });
          if (options.method !== "POST")
            return {
              options: [
                { id: "opt_size", title: "Size", values: [{ value: "Small" }] },
              ],
            };
          return { product_change: { status: "pending" } };
        },
      },
    },
  } as unknown as AuthorizedVendor;
  const form = new FormData();
  for (const [key, value] of Object.entries({
    id: "prod_owner",
    title: " Large PETG ",
    option_0: " Large ",
    amount: "24.75",
    stocked_quantity: "13",
    shipping_profile_id: "sp_owner",
    material: "PETG",
    weight: "125",
    length: "80",
    width: "70",
    height: "60",
    origin_country: "US",
    variant_images: '["img_existing"]',
    variant_uploaded_images: '[{"url":"https://example.test/new.jpg"}]',
  }))
    form.set(key, value);
  return {
    calls,
    authorized,
    form,
    operations: catalogOperations(async () => authorized),
  };
}

test("complete creation submits a single moderated request containing new options, physical attributes, photos and commercial draft", async () => {
  const { calls, form, operations } = fixture();
  const result = await operations.createVariant(form);
  assert.equal(result.product_change.status, "pending");
  assert.equal(calls.length, 2);
  assert.equal(
    calls[1].path,
    "/vendor/products/prod_owner/variant-configurations",
  );
  assert.deepEqual(calls[1].headers, { "x-seller-id": "sel_owner" });
  const body = calls[1].body as {
    variant: Record<string, unknown>;
    images: unknown;
    offer: unknown;
  };
  assert.equal(body.variant.title, "Large PETG");
  assert.deepEqual(body.variant.options, { Size: "Large" });
  assert.equal(body.variant.material, "PETG");
  assert.equal(body.variant.weight, 125);
  assert.equal(body.variant.origin_country, "US");
  assert.equal(typeof body.variant.sku, "string");
  assert.deepEqual(body.images, {
    ids: ["img_existing"],
    uploads: [{ url: "https://example.test/new.jpg" }],
  });
  assert.deepEqual(body.offer, {
    amount: 24.75,
    stocked_quantity: 13,
    shipping_profile_id: "sp_owner",
  });
});

test("zero price and stock are retained and malformed drafts never submit a mutation", async () => {
  const { calls, form, operations } = fixture();
  form.set("amount", "0");
  form.set("stocked_quantity", "0");
  await operations.createVariant(form);
  assert.deepEqual((calls[1].body as { offer: unknown }).offer, {
    amount: 0,
    stocked_quantity: 0,
    shipping_profile_id: "sp_owner",
  });
  for (const [key, value] of [
    ["stocked_quantity", "-1"],
    ["amount", "NaN"],
    ["option_0", " "],
    ["shipping_profile_id", ""],
    ["weight", "-20"],
  ]) {
    const next = fixture();
    next.form.set(key, value);
    await assert.rejects(() => next.operations.createVariant(next.form));
    assert.ok(next.calls.every((call) => call.body === undefined));
  }
});

test("inactive memberships cannot create a variant or read operational configuration", async () => {
  const { authorized, calls, form } = fixture();
  authorized.membership.member!.is_active = false;
  await assert.rejects(
    () => catalogOperations(async () => authorized).createVariant(form),
    /inactiva/,
  );
  assert.equal(calls.length, 0);
});
