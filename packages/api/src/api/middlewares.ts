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
import { vendorCatalogMiddlewares } from "./vendor/catalog/middlewares";
import { vendorCatalogImageMiddlewares } from "./vendor/catalog-images/middlewares";
import { vendorStripeAccountRefreshMiddlewares } from "./vendor/stripe-account-refresh/middlewares";
import { vendorPaymentProtectionMiddlewares } from "./vendor/payments/middlewares";
import { vendorShippingConfigurationMiddlewares } from "./vendor/shipping-configuration/middlewares";
import { vendorWarehouseMiddlewares } from "./vendor/warehouse/middlewares";
import { productSaleStatusMiddlewares } from "./vendor/product-sale-status/middlewares";
import { storeProductSaleStatusMiddlewares } from "./store/product-sale-status/middlewares";
import { performanceTrace } from "../lib/performance/http-trace";
import { nativeStripePayoutWebhookGuard } from "../lib/stripe-connect/native-guards";
import { assertPaymentCollectionSellersReadyForSale } from "../lib/stripe-connect/sale-readiness";
import { assertPaymentCollectionProductsNotPaused } from "../lib/catalog/sale-pause";
import { vendorOfferPriceMiddlewares } from "./vendor/offers/[id]/price/middlewares";

async function requireReadyPaymentSellers(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  try {
    await assertPaymentCollectionSellersReadyForSale(req.scope, req.params.id);
    await assertPaymentCollectionProductsNotPaused(req.scope, req.params.id);
    next();
  } catch (error) {
    next(error);
  }
}

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
    { matcher: /^\/(?:store|admin|vendor)(?:\/.*)?$/, middlewares: [performanceTrace] },
    ...vendorApplicationMiddlewares,
    ...vendorInventoryMiddlewares,
    ...vendorCatalogMiddlewares,
    ...vendorOfferPriceMiddlewares,
    ...vendorCatalogImageMiddlewares,
    ...vendorStripeAccountRefreshMiddlewares,
    ...vendorPaymentProtectionMiddlewares,
    ...vendorShippingConfigurationMiddlewares,
    ...vendorWarehouseMiddlewares,
    ...productSaleStatusMiddlewares,
    ...storeProductSaleStatusMiddlewares,
    ...customerAccountMiddlewares,
    ...favoriteMiddlewares,
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      method: "POST",
      middlewares: [requireReadyPaymentSellers],
    },
    {
      matcher: "/hooks/payout",
      method: "POST",
      bodyParser: { preserveRawBody: true, sizeLimit: "256kb" },
      middlewares: [nativeStripePayoutWebhookGuard],
    },
    {
      matcher: "/vendor/sellers",
      method: "POST",
      middlewares: [requireSellerRegistrationFlag],
    },
  ],
});
