import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrderDetailDTO, OrderLineItemDTO } from "@medusajs/types";
import type { VendorOrderCompletionResponse } from "@usapeek/api/order-notification-contracts";
import type { AuthorizedVendor } from "../workspace/operations";
import {
  orderCapabilities,
  orderOperations,
  preparationGroup,
} from "./operations";

function item(overrides: Partial<OrderLineItemDTO> = {}): OrderLineItemDTO {
  return {
    id: "item_shipping",
    quantity: 2,
    requires_shipping: true,
    detail: {
      quantity: 2,
      fulfilled_quantity: 2,
      shipped_quantity: 2,
      delivered_quantity: 0,
    },
    ...overrides,
  } as OrderLineItemDTO;
}

function order(
  items: OrderLineItemDTO[],
  status: OrderDetailDTO["status"] = "pending",
): OrderDetailDTO {
  return {
    id: "order_delivery",
    status,
    items,
    fulfillments: [],
  } as unknown as OrderDetailDTO;
}

test("shipping every unit is insufficient to complete an order", () => {
  assert.equal(orderCapabilities(order([item()])).complete, false);
});

test("the API can allow prepared physical pickup, but never a terminal order", () => {
  const completion = {
    can_complete: true,
    pickup_fulfillment_ids: ["ful_pickup"],
    preparation_groups: [],
  };
  assert.equal(orderCapabilities(order([item()]), completion).complete, true);
  assert.equal(
    orderCapabilities(order([item()], "completed"), completion).complete,
    false,
  );
  assert.equal(
    orderCapabilities(order([item()]), { ...completion, can_complete: false })
      .complete,
    false,
  );
});

test("every shipping line must be fully delivered", () => {
  const delivered = item({
    detail: { ...item().detail!, delivered_quantity: 2 },
  });
  assert.equal(orderCapabilities(order([delivered])).complete, true);
  assert.equal(
    orderCapabilities(
      order([
        delivered,
        item({
          id: "item_partial",
          detail: { ...item().detail!, delivered_quantity: 1 },
        }),
      ]),
    ).complete,
    false,
  );
});

test("items without shipping require fulfillment rather than delivery", () => {
  assert.equal(
    orderCapabilities(order([item({ requires_shipping: false })])).complete,
    true,
  );
  assert.equal(
    orderCapabilities(
      order([
        item({
          requires_shipping: false,
          detail: { ...item().detail!, fulfilled_quantity: 1 },
        }),
      ]),
    ).complete,
    false,
  );
});

test("missing or invalid delivery quantities cannot enable completion", () => {
  for (const deliveredQuantity of [undefined, NaN, Infinity, -1, 2.5]) {
    assert.equal(
      orderCapabilities(
        order([
          item({
            detail: {
              ...item().detail!,
              delivered_quantity: deliveredQuantity,
            } as NonNullable<OrderLineItemDTO["detail"]>,
          }),
        ]),
      ).complete,
      false,
    );
  }
});

test("an empty order or an order outside pending cannot be completed", () => {
  assert.equal(orderCapabilities(order([])).complete, false);
  for (const status of ["completed", "canceled"] as const) {
    assert.equal(
      orderCapabilities(
        order(
          [item({ detail: { ...item().detail!, delivered_quantity: 2 } })],
          status,
        ),
      ).complete,
      false,
    );
  }
});

const preparation: VendorOrderCompletionResponse = {
  can_complete: false,
  pickup_fulfillment_ids: [],
  preparation_groups: [
    {
      shipping_option_id: "so_pickup",
      is_pickup: true,
      item_ids: ["item_pickup"],
    },
    {
      shipping_option_id: "so_shipping",
      is_pickup: false,
      item_ids: ["item_shipping"],
    },
    { shipping_option_id: null, is_pickup: false, item_ids: ["item_digital"] },
  ],
};

test("preparation groups require the selected delivery option and matching articles", () => {
  assert.equal(
    preparationGroup(preparation, "so_pickup", ["item_pickup"]).is_pickup,
    true,
  );
  assert.equal(
    preparationGroup(preparation, null, ["item_digital"]).shipping_option_id,
    null,
  );
  for (const [option, ids] of [
    [null, ["item_pickup"]],
    ["so_pickup", ["item_shipping"]],
    ["so_pickup", ["item_pickup", "item_shipping"]],
    ["so_other", ["item_pickup"]],
  ] as const) {
    assert.throws(() => preparationGroup(preparation, option, [...ids]));
  }
  assert.throws(() =>
    preparationGroup(undefined, "so_pickup", ["item_pickup"]),
  );
});

test("physical pickup preparation sends its selected option without changing requires_shipping", async () => {
  const calls: { path: string; body?: unknown }[] = [];
  const authorized = {
    membership: {
      member: { is_active: true },
      seller: { id: "sel_owner", status: "open" },
    },
    sdk: {
      client: {
        async fetch(path: string, options: { body?: unknown }) {
          calls.push({ path, body: options.body });
          if (path.endsWith("/completion")) return preparation;
          if (path === "/vendor/warehouse")
            return {
              stock_location: {
                id: "sloc_store",
                address: {
                  address_1: "123 Store",
                  city: "Miami",
                  postal_code: "33101",
                  country_code: "us",
                },
              },
            };
          return {
            order: order([
              item({
                id: "item_pickup",
                detail: { ...item().detail!, fulfilled_quantity: 0 },
              }),
            ]),
          };
        },
      },
    },
  } as unknown as AuthorizedVendor;
  const form = new FormData();
  form.set("order_id", "order_delivery");
  form.set("action", "prepare");
  form.set("shipping_option_id", "so_pickup");
  form.set("quantity:item_pickup", "2");
  await orderOperations(async () => authorized).execute(form);
  assert.deepEqual(
    calls.find((call) => call.path.endsWith("/fulfillments"))?.body,
    {
      items: [{ id: "item_pickup", quantity: 2 }],
      shipping_option_id: "so_pickup",
      location_id: "sloc_store",
      requires_shipping: true,
    },
  );
});
