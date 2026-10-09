import { POST } from "../../../api/vendor/orders/[id]/fulfillments/route";
import { createVendorOrderFulfillmentWorkflow } from "../../../workflows/create-vendor-order-fulfillment";

jest.mock("../../../workflows/create-vendor-order-fulfillment", () => ({
  createVendorOrderFulfillmentWorkflow: jest.fn(),
}));

it("passes the validated option to the native wrapper with the authenticated seller and route order", async () => {
  const run = jest.fn().mockResolvedValue({ result: { id: "fulfillment_1" } });
  jest
    .mocked(createVendorOrderFulfillmentWorkflow)
    .mockReturnValue({ run } as unknown as ReturnType<
      typeof createVendorOrderFulfillmentWorkflow
    >);
  const scope = {};
  const body = {
    items: [{ id: "item_1", quantity: 1 }],
    shipping_option_id: "option_shipping",
    requires_shipping: true,
    location_id: "location_owned",
  };
  const request = {
    scope,
    params: { id: "order_owned" },
    seller_context: { seller_id: "seller_owned" },
    // Even if extra fields reached this adapter, they cannot replace its scope.
    validatedBody: {
      ...body,
      seller_id: "seller_other",
      order_id: "order_other",
    },
  };
  const json = jest.fn();
  await POST(
    request as unknown as Parameters<typeof POST>[0],
    { json } as unknown as Parameters<typeof POST>[1],
  );
  expect(createVendorOrderFulfillmentWorkflow).toHaveBeenCalledWith(scope);
  expect(run).toHaveBeenCalledWith({
    input: { ...body, seller_id: "seller_owned", order_id: "order_owned" },
  });
  expect(json).toHaveBeenCalledWith({ fulfillment: { id: "fulfillment_1" } });
});
