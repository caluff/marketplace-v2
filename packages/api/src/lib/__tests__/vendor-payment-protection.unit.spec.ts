import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import {
  rejectVendorPaymentCapture,
  vendorPaymentProtectionMiddlewares,
} from "../../api/vendor/payments/middlewares";

describe("shared cart payment protection", () => {
  it.each([{}, { amount: 1 }, { amount: 100000 }])(
    "rejects vendor-selected capture amounts without touching payment services: %j",
    (body) => {
      const resolve = jest.fn();
      const req = { body, scope: { resolve } } as unknown as MedusaRequest;
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });

      rejectVendorPaymentCapture(req, { status } as unknown as MedusaResponse);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ type: "not_allowed" }),
      );
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it("targets only the vendor capture mutation, leaving reads and admin routes intact", () => {
    expect(vendorPaymentProtectionMiddlewares).toEqual([
      {
        matcher: "/vendor/payments/:id/capture",
        method: "POST",
        middlewares: [rejectVendorPaymentCapture],
      },
    ]);
  });
});
