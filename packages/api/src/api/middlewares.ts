import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http";
import { FeatureFlag, MedusaError } from "@medusajs/framework/utils";
import { customerAccountMiddlewares } from "./store/customer-account/middlewares";
import { favoriteMiddlewares } from "./store/customers/me/favorites/middlewares";
import { vendorApplicationMiddlewares } from "./store/vendor-application/middlewares";
import { vendorInventoryMiddlewares } from "./vendor/inventory-adjustments/middlewares";

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
    ...vendorApplicationMiddlewares,
    ...vendorInventoryMiddlewares,
    ...customerAccountMiddlewares,
    ...favoriteMiddlewares,
    {
      matcher: "/vendor/sellers",
      method: "POST",
      middlewares: [requireSellerRegistrationFlag],
    },
  ],
});
