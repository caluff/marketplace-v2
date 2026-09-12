import type {
  IPaymentProvider,
  ProviderWebhookPayload,
  WebhookActionResult,
} from "@medusajs/framework/types";
import { MedusaError, PaymentActions } from "@medusajs/framework/utils";
import nativeStripeModule from "@medusajs/medusa/payment-stripe";
import type Stripe from "stripe";

export const FINAL_CAPTURE_OPERATION_METADATA =
  "marketplace_final_capture_operation_id";

// The installed module exports its provider constructors, but not their types.
// This boundary describes the native signature-verification method we reuse.
type NativeStripeProvider = IPaymentProvider & {
  constructWebhookEvent(data: ProviderWebhookPayload["payload"]): Stripe.Event;
};
type NativeStripeConstructor = {
  new (container: Record<string, unknown>, options: Record<string, unknown>): NativeStripeProvider;
  identifier: string;
};

const nativeService = nativeStripeModule.services.find(
  (service) => "identifier" in service && service.identifier === "stripe",
);
if (!nativeService)
  throw new MedusaError(
    MedusaError.Types.UNEXPECTED_STATE,
    "The native Stripe payment provider is unavailable.",
  );
export const NativeStripeService = nativeService as NativeStripeConstructor;

export default class StripeAllocatedPaymentService extends NativeStripeService {
  static identifier = "stripe";

  override async getWebhookActionAndData(
    webhookData: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    const event = this.constructWebhookEvent(webhookData);
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object;
      const operationId = intent.metadata?.[FINAL_CAPTURE_OPERATION_METADATA];
      if (
        event.livemode === false &&
        intent.livemode === false &&
        intent.status === "succeeded" &&
        typeof operationId === "string" &&
        operationId.trim().length > 0
      ) {
        // The durable finance operation owns native capture bookkeeping. Replaying
        // this webhook would create another capture for a final partial capture.
        return { action: PaymentActions.NOT_SUPPORTED };
      }
    }
    return super.getWebhookActionAndData(webhookData);
  }
}
