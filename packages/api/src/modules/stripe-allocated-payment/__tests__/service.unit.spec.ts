import type { ProviderWebhookPayload } from "@medusajs/framework/types";
import { PaymentActions } from "@medusajs/framework/utils";
import nativeStripeModule from "@medusajs/medusa/payment-stripe";
import Stripe from "stripe";
import allocatedStripeModule from "../index";
import StripeAllocatedPaymentService, {
  FINAL_CAPTURE_OPERATION_METADATA,
  NativeStripeService,
} from "../service";

const options = { apiKey: "sk_test_unit_only", webhookSecret: "whsec_unit_only" };
const stripe = new Stripe(options.apiKey);

function payload(
  intentOverrides: Record<string, unknown> = {},
  eventOverrides: Record<string, unknown> = {},
): ProviderWebhookPayload["payload"] {
  const data = {
    id: "evt_test",
    type: "payment_intent.succeeded",
    livemode: false,
    data: {
      object: {
        id: "pi_test",
        object: "payment_intent",
        status: "succeeded",
        livemode: false,
        amount: 15000,
        amount_received: 7500,
        amount_capturable: 0,
        currency: "usd",
        metadata: {
          session_id: "payses_test",
          [FINAL_CAPTURE_OPERATION_METADATA]: "finance_operation_test",
        },
        ...intentOverrides,
      },
    },
    ...eventOverrides,
  };
  const rawData = JSON.stringify(data);
  return {
    data,
    rawData,
    headers: {
      "stripe-signature": stripe.webhooks.generateTestHeaderString({
        payload: rawData,
        secret: options.webhookSecret,
      }),
    },
  };
}

describe("allocated Stripe payment webhook provider", () => {
  it("suppresses repeated signed test success events owned by the finance journal", async () => {
    const service = new StripeAllocatedPaymentService({}, options);
    const webhook = payload();
    await expect(service.getWebhookActionAndData(webhook)).resolves.toEqual({ action: PaymentActions.NOT_SUPPORTED });
    await expect(service.getWebhookActionAndData(webhook)).resolves.toEqual({ action: PaymentActions.NOT_SUPPORTED });
  });

  it.each([
    { metadata: { session_id: "payses_test" } },
    { metadata: { session_id: "payses_test", [FINAL_CAPTURE_OPERATION_METADATA]: "" } },
    { metadata: { session_id: "payses_test", [FINAL_CAPTURE_OPERATION_METADATA]: "  " } },
    { metadata: { session_id: "payses_test", [FINAL_CAPTURE_OPERATION_METADATA]: 12 } },
    { livemode: true },
    { status: "processing" },
  ])("preserves native handling for an ineligible intent: %j", async (overrides) => {
    const webhook = payload(overrides);
    const service = new StripeAllocatedPaymentService({}, options);
    const native = new NativeStripeService({}, options);
    await expect(service.getWebhookActionAndData(webhook)).resolves.toEqual(await native.getWebhookActionAndData(webhook));
  });

  it.each([
    { type: "payment_intent.amount_capturable_updated" },
    { type: "payment_intent.canceled" },
    { type: "payment_intent.payment_failed" },
    { type: "payment_intent.requires_action" },
    { type: "unhandled.event" },
    { livemode: true },
  ])("preserves native handling for other events: %j", async (overrides) => {
    const webhook = payload({}, overrides);
    const service = new StripeAllocatedPaymentService({}, options);
    const native = new NativeStripeService({}, options);
    await expect(service.getWebhookActionAndData(webhook)).resolves.toEqual(await native.getWebhookActionAndData(webhook));
  });

  it("rejects a forged signature before trusting the operation marker", async () => {
    const service = new StripeAllocatedPaymentService({}, options);
    const webhook = payload();
    webhook.headers["stripe-signature"] = "t=1,v1=forged";
    await expect(service.getWebhookActionAndData(webhook)).rejects.toThrow();
  });

  it("preserves registration and every other native provider method", () => {
    expect(StripeAllocatedPaymentService.identifier).toBe("stripe");
    expect(allocatedStripeModule.services).toHaveLength(nativeStripeModule.services.length);
    nativeStripeModule.services.forEach((service, index) => {
      expect(allocatedStripeModule.services[index]).toBe(service === NativeStripeService ? StripeAllocatedPaymentService : service);
    });
    for (const method of ["initiatePayment", "authorizePayment", "capturePayment", "refundPayment", "cancelPayment", "retrievePayment", "updatePayment"] as const) {
      expect(StripeAllocatedPaymentService.prototype[method]).toBe(NativeStripeService.prototype[method]);
    }
    expect(Object.getPrototypeOf(StripeAllocatedPaymentService)).toBe(NativeStripeService);
  });
});
