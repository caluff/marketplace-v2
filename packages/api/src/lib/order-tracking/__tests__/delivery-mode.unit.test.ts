import { fulfillmentDeliveryMode, orderDeliveryMode } from "../delivery-mode";

it("uses canonical pickup markers and never infers the mode from a display name", () => {
  expect(fulfillmentDeliveryMode({ shipping_option: { metadata: { marketplace_v2_pickup: true } } })).toBe("pickup");
  expect(fulfillmentDeliveryMode({ name: "Recogida en tienda" })).toBe("unknown");
  expect(orderDeliveryMode([{ shipping_option: { metadata: { marketplace_v2_pickup: true } } }, {}])).toBe("unknown");
});
