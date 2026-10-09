import { MedusaModule } from "@medusajs/framework/modules-sdk";
import { assertStoreOrderProjection } from "../../../api/store/cart-ownership/order-projection";

it("allows the delivery mode paths without opening arbitrary option relations", () => {
  expect(() => assertStoreOrderProjection([
    "shipping_methods.shipping_option.metadata",
    "shipping_methods.shipping_option.service_zone.fulfillment_set.type",
    "fulfillments.shipping_option.metadata",
    "fulfillments.shipping_option.service_zone.fulfillment_set.type",
  ], "order")).not.toThrow();
  expect(() => assertStoreOrderProjection(["shipping_methods.shipping_option.*"], "order")).toThrow();
  expect(() => assertStoreOrderProjection(["fulfillments.shipping_option.service_zone.fulfillment_set.locations.*"], "order")).toThrow();
});

it("registers a read-only order shipping option relationship without a persistence table", () => {
  const register = jest.spyOn(MedusaModule, "setCustomLink");
  require("../../../links/order-shipping-method-option");
  const callback = register.mock.calls[register.mock.calls.length - 1]?.[0];
  expect(callback).toEqual(expect.any(Function));
  if (typeof callback !== "function") return;
  const definition = callback([
    { serviceName: "order" },
    { serviceName: "fulfillment" },
  ] as Parameters<typeof callback>[0]);
  expect(definition).toMatchObject({
    isLink: true,
    isReadOnlyLink: true,
    extends: [{
      serviceName: "order",
      entity: "OrderShippingMethod",
      relationship: {
        serviceName: "fulfillment",
        entity: "ShippingOption",
        foreignKey: "shipping_option_id",
        primaryKey: "id",
        alias: "shipping_option",
      },
    }],
  });
  expect(definition).not.toHaveProperty("databaseConfig");
  register.mockRestore();
});
