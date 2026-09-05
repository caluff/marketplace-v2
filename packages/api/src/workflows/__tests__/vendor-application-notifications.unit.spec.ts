import { asValue } from "@medusajs/framework/awilix";
import type { NotificationDTO } from "@medusajs/framework/types";
import { createMedusaContainer } from "@medusajs/framework/utils";
import deliverVendorApplicationNotifications from "../../jobs/vendor-application-notifications";
import { deliverEmailNotification } from "../../lib/deliver-email-notification";
import { onboardingEmailConfiguration } from "../../lib/vendor-onboarding/email";
import { deliverVendorApplicationNotificationWorkflow } from "../vendor-application-notifications";

jest.mock("../../lib/deliver-email-notification", () => ({ deliverEmailNotification: jest.fn() }));
jest.mock("../../lib/vendor-onboarding/email", () => ({ onboardingEmailConfiguration: jest.fn() }));

const event = (index: number) => ({
  id: `vappevt_${index}`,
  application_id: "vapp_one",
  type: "submitted",
  reason: null,
  email_claimed_at: new Date("2026-09-05T00:00:00Z"),
});

function fixture(count = 0) {
  const pending = Array.from({ length: count }, (_, index) => event(index));
  const service = {
    claimEmailEvent: jest.fn(async () => pending.shift() ?? null),
    retrieveVendorApplication: jest.fn(async () => ({ applicant_email: "buyer@example.com" })),
    finishEmailEvent: jest.fn(async () => undefined),
  };
  const logger = { warn: jest.fn(), error: jest.fn(), info: jest.fn() };
  const container = createMedusaContainer();
  container.register({
    vendorOnboarding: asValue(service),
    logger: asValue(logger),
    event_bus: asValue({ releaseGroupedEvents: jest.fn(async () => undefined), clearGroupedEvents: jest.fn(async () => undefined) }),
  });
  return { container, service, logger, pending };
}

describe("vendor notification job with the real workflow", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(onboardingEmailConfiguration).mockReturnValue({ enabled: true, from: "marketplace-v2 <onboarding@resend.dev>" });
    jest.mocked(deliverEmailNotification).mockResolvedValue({ id: "noti_test", status: "success" } as NotificationDTO);
  });

  it("does not start a workflow or claim events when email is disabled", async () => {
    const state = fixture(1);
    jest.mocked(onboardingEmailConfiguration).mockReturnValue(null);
    await deliverVendorApplicationNotifications(state.container);
    expect(onboardingEmailConfiguration).toHaveBeenCalledTimes(1);
    expect(state.service.claimEmailEvent).not.toHaveBeenCalled();
    expect(deliverEmailNotification).not.toHaveBeenCalled();
  });

  it("also protects direct workflow execution when email is disabled", async () => {
    const state = fixture(1);
    jest.mocked(onboardingEmailConfiguration).mockReturnValue(null);
    const { result } = await deliverVendorApplicationNotificationWorkflow(state.container).run({ input: {} });
    expect(result).toEqual({ configured: false, status: "disabled" });
    expect(state.service.claimEmailEvent).not.toHaveBeenCalled();
  });

  it("stops after one empty claim rather than executing twenty empty workflows", async () => {
    const state = fixture();
    await deliverVendorApplicationNotifications(state.container);
    expect(state.service.claimEmailEvent).toHaveBeenCalledTimes(1);
    expect(state.service.finishEmailEvent).not.toHaveBeenCalled();
    expect(deliverEmailNotification).not.toHaveBeenCalled();
  });

  it("drains real pending events, preserves idempotency, then stops on empty", async () => {
    const state = fixture(3);
    await deliverVendorApplicationNotifications(state.container);
    expect(state.service.claimEmailEvent).toHaveBeenCalledTimes(4);
    expect(deliverEmailNotification).toHaveBeenCalledTimes(3);
    expect(state.service.finishEmailEvent).toHaveBeenCalledTimes(3);
    for (let index = 0; index < 3; index++) {
      expect(jest.mocked(deliverEmailNotification).mock.calls[index][1]).toEqual(expect.objectContaining({
        idempotency_key: `vappevt_${index}`, to: "buyer@example.com", template: "vendor-application-submitted",
      }));
      expect(state.service.finishEmailEvent).toHaveBeenNthCalledWith(index + 1, `vappevt_${index}`, event(index).email_claimed_at, "sent");
    }
  });

  it("caps a busy run at twenty events and leaves the remaining backlog untouched", async () => {
    const state = fixture(25);
    await deliverVendorApplicationNotifications(state.container);
    expect(state.service.claimEmailEvent).toHaveBeenCalledTimes(20);
    expect(deliverEmailNotification).toHaveBeenCalledTimes(20);
    expect(state.pending).toHaveLength(5);
  });

  it("does not burn retries for the same failed event in one run; the next run can retry", async () => {
    const state = fixture();
    state.service.claimEmailEvent.mockResolvedValue(event(0));
    jest.mocked(deliverEmailNotification).mockRejectedValue(new Error("private provider failure"));
    await deliverVendorApplicationNotifications(state.container);
    expect(state.service.claimEmailEvent).toHaveBeenCalledTimes(1);
    expect(deliverEmailNotification).toHaveBeenCalledTimes(1);
    expect(state.service.finishEmailEvent).toHaveBeenCalledWith("vappevt_0", event(0).email_claimed_at, "failed");

    state.service.claimEmailEvent.mockResolvedValueOnce(event(0)).mockResolvedValue(null);
    jest.mocked(deliverEmailNotification).mockResolvedValue({ id: "noti_test", status: "success" } as NotificationDTO);
    await deliverVendorApplicationNotifications(state.container);
    expect(deliverEmailNotification).toHaveBeenCalledTimes(2);
    expect(state.service.finishEmailEvent).toHaveBeenLastCalledWith("vappevt_0", event(0).email_claimed_at, "sent");
    expect(jest.mocked(deliverEmailNotification).mock.calls[0][1].idempotency_key).toBe(jest.mocked(deliverEmailNotification).mock.calls[1][1].idempotency_key);
  });

  it("does not drain more events after an unconfirmed notification response", async () => {
    const state = fixture(3);
    jest.mocked(deliverEmailNotification).mockResolvedValue({ status: "failure" } as NotificationDTO);
    await deliverVendorApplicationNotifications(state.container);
    expect(state.service.claimEmailEvent).toHaveBeenCalledTimes(1);
    expect(state.pending).toHaveLength(2);
    expect(state.service.finishEmailEvent).toHaveBeenCalledWith("vappevt_0", event(0).email_claimed_at, "failed");
  });

  it("stops on a claim failure and emits only a sanitized job warning", async () => {
    const state = fixture();
    state.service.claimEmailEvent.mockRejectedValue(new Error("private database credentials"));
    await expect(deliverVendorApplicationNotifications(state.container)).resolves.toBeUndefined();
    expect(state.service.claimEmailEvent).toHaveBeenCalledTimes(1);
    expect(deliverEmailNotification).not.toHaveBeenCalled();
    expect(state.logger.warn).toHaveBeenCalledTimes(1);
    expect(state.logger.warn).toHaveBeenCalledWith("[vendor-notifications] Processing stopped; retrying on the next scheduled run.");
  });
});
