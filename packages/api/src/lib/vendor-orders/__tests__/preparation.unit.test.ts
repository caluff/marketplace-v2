import type { MedusaContainer } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { VendorCreateFulfillment } from "@mercurjs/core/api/vendor/orders/validators";
import { assertSellerWarehouseLocations } from "../../vendor-warehouse/access";
import { readVendorOrderCompletion } from "../completion";
import {
  prepareVendorOrderFulfillment,
  type VendorOrderPreparationInput,
} from "../preparation";

jest.mock("../completion", () => ({ readVendorOrderCompletion: jest.fn() }));
jest.mock("../../vendor-warehouse/access", () => ({
  assertSellerWarehouseLocations: jest.fn(),
}));

const container = {} as MedusaContainer;
const groups = [
  {
    shipping_option_id: "option_pickup",
    is_pickup: true,
    item_ids: ["item_pickup"],
  },
  {
    shipping_option_id: "option_shipping",
    is_pickup: false,
    item_ids: ["item_shipping", "item_shipping_2"],
  },
  { shipping_option_id: null, is_pickup: false, item_ids: ["item_digital"] },
];
const input: VendorOrderPreparationInput = {
  order_id: "order_owned",
  seller_id: "seller_owned",
  location_id: "location_owned",
  items: [{ id: "item_shipping", quantity: 2 }],
  requires_shipping: true,
  shipping_option_id: "option_shipping",
  additional_data: { source: "seller" },
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(readVendorOrderCompletion).mockResolvedValue({
    can_complete: false,
    pickup_fulfillment_ids: [],
    preparation_groups: groups,
  });
  jest
    .mocked(assertSellerWarehouseLocations)
    .mockResolvedValue("location_owned");
});

it("accepts the app's explicit shipping option through the installed strict native validator", () => {
  const { order_id: _order, seller_id: _seller, ...body } = input;
  const schema = VendorCreateFulfillment().strict();
  expect(schema.parse(body)).toEqual(body);
  expect(schema.safeParse({ ...body, shipping_option_id: "" }).success).toBe(
    false,
  );
  expect(schema.safeParse({ ...body, seller_id: "seller_other" }).success).toBe(
    false,
  );
  expect(
    schema.safeParse({ ...body, shipping_option_id: undefined }).success,
  ).toBe(true);
});

it("retains the purchased shipping group instead of the first pickup option and preserves native extra data", async () => {
  expect(await prepareVendorOrderFulfillment(container, input)).toEqual({
    order_id: input.order_id,
    location_id: input.location_id,
    items: input.items,
    requires_shipping: true,
    shipping_option_id: "option_shipping",
    additional_data: input.additional_data,
    created_by: "seller_owned",
  });
  expect(readVendorOrderCompletion).toHaveBeenCalledWith(
    container,
    "seller_owned",
    "order_owned",
  );
  expect(assertSellerWarehouseLocations).toHaveBeenCalledWith(
    container,
    "seller_owned",
    ["location_owned"],
  );
});

it("infers an omitted option from the selected items and supports the distinct pickup and digital groups", async () => {
  const legacy = { ...input, shipping_option_id: undefined };
  expect(
    (await prepareVendorOrderFulfillment(container, legacy)).shipping_option_id,
  ).toBe("option_shipping");
  expect(
    (
      await prepareVendorOrderFulfillment(container, {
        ...legacy,
        items: [{ id: "item_pickup", quantity: 1 }],
      })
    ).shipping_option_id,
  ).toBe("option_pickup");
  expect(
    await prepareVendorOrderFulfillment(container, {
      ...legacy,
      items: [{ id: "item_digital", quantity: 1 }],
      requires_shipping: false,
    }),
  ).not.toHaveProperty("shipping_option_id");
});

it.each([
  { shipping_option_id: "option_foreign" },
  { shipping_option_id: "option_pickup" },
  { requires_shipping: false },
  { items: [{ id: "item_other_order", quantity: 1 }] },
  {
    items: [
      { id: "item_pickup", quantity: 1 },
      { id: "item_shipping", quantity: 1 },
    ],
  },
  {
    items: [
      { id: "item_digital", quantity: 1 },
      { id: "item_shipping", quantity: 1 },
    ],
  },
])(
  "rejects foreign options, cross-group items and a shipping mode mismatch: %j",
  async (override) => {
    await expect(
      prepareVendorOrderFulfillment(container, { ...input, ...override }),
    ).rejects.toThrow("misma opción de entrega");
    expect(assertSellerWarehouseLocations).not.toHaveBeenCalled();
  },
);

it.each(
  [
    [],
    [{ id: "item_shipping", quantity: 0 }],
    [{ id: "item_shipping", quantity: 1.5 }],
    [
      { id: "item_shipping", quantity: 1 },
      { id: "item_shipping", quantity: 1 },
    ],
  ].map((items) => ({ items })),
)(
  "rejects empty, zero, fractional and duplicated preparation quantities: %j",
  async ({ items }) => {
    await expect(
      prepareVendorOrderFulfillment(container, { ...input, items }),
    ).rejects.toThrow("cantidades positivas");
  },
);

it("fails closed when the purchased option cannot be determined", async () => {
  jest.mocked(readVendorOrderCompletion).mockResolvedValue({
    can_complete: false,
    pickup_fulfillment_ids: [],
    preparation_groups: [],
  });
  await expect(prepareVendorOrderFulfillment(container, input)).rejects.toThrow(
    "misma opción de entrega",
  );
});

it("propagates native seller ownership and warehouse validation failures before preparation", async () => {
  jest
    .mocked(readVendorOrderCompletion)
    .mockRejectedValueOnce(
      new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Order does not belong to seller",
      ),
    );
  await expect(prepareVendorOrderFulfillment(container, input)).rejects.toThrow(
    "Order does not belong to seller",
  );
  expect(assertSellerWarehouseLocations).not.toHaveBeenCalled();
  jest
    .mocked(assertSellerWarehouseLocations)
    .mockRejectedValueOnce(
      new MedusaError(MedusaError.Types.NOT_ALLOWED, "inventory_scope_forbidden"),
    );
  await expect(prepareVendorOrderFulfillment(container, input)).rejects.toThrow(
    "inventory_scope_forbidden",
  );
});
