import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http";
import { FeatureFlag, MedusaError } from "@medusajs/framework/utils";

const requireSellerRegistrationFlag = (
  _req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) => {
  if (!FeatureFlag.isFeatureEnabled("seller_registration")) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Seller registration is disabled.",
    );
  }

  next();
};

export default defineMiddlewares({
  routes: [
    {
      matcher: "/vendor/sellers",
      method: "POST",
      middlewares: [requireSellerRegistrationFlag],
    },
  ],
});
