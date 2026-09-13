import { asValue } from "@medusajs/framework/awilix";
import { AuthWorkflowEvents, createMedusaContainer } from "@medusajs/framework/utils";
import { loadApplicant } from "../../lib/vendor-onboarding/access";
import { onboardingEmailConfiguration } from "../../lib/vendor-onboarding/email";
import { OnboardingError } from "../../lib/vendor-onboarding/errors";
import { canonicalHash } from "../../lib/vendor-onboarding/validation";
import { isTestEmailVerificationEnabled } from "../../lib/vendor-onboarding/verification";
import { requestVendorApplicationVerificationWorkflow } from "../vendor-application-notifications";

jest.mock("../../lib/vendor-onboarding/email", () => ({ onboardingEmailConfiguration: jest.fn() }));

const input = { applicant: { customer_id: "cus_one", auth_identity_id: "auth_one" }, ip: "127.0.0.1" };

function fixture() {
  const identity = { id: "auth_one", app_metadata: { customer_id: "cus_one" }, provider_identities: [{ provider: "emailpass", entity_id: "tester@example.com" }] };
  const verification = { auth_identity_id: "auth_one", entity_id: "tester@example.com", entity_type: "email", code_provider: "token", code: "481529", verified_at: null, metadata: { actor_type: "customer", vendor_onboarding: true } };
  const auth = {
    retrieveAuthIdentity: jest.fn(async () => identity),
    listAuthVerifications: jest.fn(async () => [verification]),
    requestAuthVerification: jest.fn(async () => verification),
    updateAuthVerifications: jest.fn(),
  };
  const service = { reserveVerification: jest.fn(async () => undefined) };
  const eventBus = { emit: jest.fn(async () => undefined), releaseGroupedEvents: jest.fn(async () => undefined), clearGroupedEvents: jest.fn(async () => undefined) };
  const query = { graph: jest.fn(async () => ({ data: [{ id: "cus_one", email: "tester@example.com", has_account: true }] })) };
  const container = createMedusaContainer();
  container.register({
    auth: asValue(auth), query: asValue(query), seller: asValue({}), vendorOnboarding: asValue(service), event_bus: asValue(eventBus),
  });
  return { container, auth, identity, verification, service, eventBus, query };
}

describe("vendor verification with the real native workflow", () => {
  const originalEnvironment = process.env;
  beforeEach(() => {
    process.env = { ...originalEnvironment };
    delete process.env.VENDOR_ONBOARDING_TEST_VERIFICATION;
    jest.resetAllMocks();
    jest.mocked(onboardingEmailConfiguration).mockReturnValue(null);
  });
  afterEach(() => { process.env = originalEnvironment; });

  it("generates and returns the native code for the authenticated email without sending email or verifying it", async () => {
    process.env.VENDOR_ONBOARDING_TEST_VERIFICATION = "true";
    const state = fixture();
    const { result } = await requestVendorApplicationVerificationWorkflow(state.container).run({ input });
    expect(result).toEqual({ requested: true, retry_after_seconds: 60, test_code: state.verification.code });
    expect(state.service.reserveVerification).toHaveBeenCalledWith("cus_one", canonicalHash(input.ip));
    expect(state.auth.requestAuthVerification).toHaveBeenCalledTimes(1);
    expect(state.auth.requestAuthVerification).toHaveBeenCalledWith({ auth_identity_id: "auth_one", entity_id: "tester@example.com", entity_type: "email", code_provider: "token", metadata: { actor_type: "customer", vendor_onboarding: true } });
    expect(state.service.reserveVerification.mock.invocationCallOrder[0]).toBeLessThan(state.auth.requestAuthVerification.mock.invocationCallOrder[0]);
    expect(state.eventBus.emit).not.toHaveBeenCalled();
    expect(state.auth.updateAuthVerifications).not.toHaveBeenCalled();
    expect((await loadApplicant(state.container, input.applicant)).emailVerified).toBe(false);
  });

  it.each([undefined, "false"])("uses native email delivery without returning a code when the flag is %s, even in development", async flag => {
    process.env.NODE_ENV = "development";
    if (flag !== undefined) process.env.VENDOR_ONBOARDING_TEST_VERIFICATION = flag;
    jest.mocked(onboardingEmailConfiguration).mockReturnValue({ enabled: true, from: "test@example.com" });
    const state = fixture();
    const { result } = await requestVendorApplicationVerificationWorkflow(state.container).run({ input });
    expect(result).toEqual({ requested: true, retry_after_seconds: 60 });
    expect(state.auth.requestAuthVerification).toHaveBeenCalledTimes(1);
    expect(state.eventBus.emit).toHaveBeenCalledWith([expect.objectContaining({ name: AuthWorkflowEvents.VERIFICATION_REQUESTED, data: expect.objectContaining({ code: state.verification.code, auth_identity_id: "auth_one", entity_id: "tester@example.com" }) })]);
  });

  it("requires a configured email provider when test mode is disabled", async () => {
    const state = fixture();
    await expect(requestVendorApplicationVerificationWorkflow(state.container).run({ input })).rejects.toMatchObject({ code: "email_service_unconfigured" });
    expect(state.service.reserveVerification).not.toHaveBeenCalled();
    expect(state.auth.requestAuthVerification).not.toHaveBeenCalled();
  });

  it.each(["customer", "email"])("rejects a mismatched %s before generating a code", async mismatch => {
    process.env.VENDOR_ONBOARDING_TEST_VERIFICATION = "true";
    const state = fixture();
    if (mismatch === "customer") state.identity.app_metadata.customer_id = "cus_other";
    else state.identity.provider_identities[0].entity_id = "other@example.com";
    await expect(requestVendorApplicationVerificationWorkflow(state.container).run({ input })).rejects.toMatchObject({ code: "identity_changed" });
    expect(state.service.reserveVerification).not.toHaveBeenCalled();
    expect(state.auth.requestAuthVerification).not.toHaveBeenCalled();
    expect(state.eventBus.emit).not.toHaveBeenCalled();
  });

  it("enforces the reservation rate limit before generating a test code", async () => {
    process.env.VENDOR_ONBOARDING_TEST_VERIFICATION = "true";
    const state = fixture();
    state.service.reserveVerification.mockRejectedValue(new OnboardingError("verification_rate_limited", 429));
    await expect(requestVendorApplicationVerificationWorkflow(state.container).run({ input })).rejects.toMatchObject({ code: "verification_rate_limited" });
    expect(state.auth.requestAuthVerification).not.toHaveBeenCalled();
    expect(state.eventBus.emit).not.toHaveBeenCalled();
  });

  it.each([undefined, "false", "TRUE", "1", " true "])("does not advertise test capability for %s", value => {
    if (value !== undefined) process.env.VENDOR_ONBOARDING_TEST_VERIFICATION = value;
    expect(isTestEmailVerificationEnabled()).toBe(false);
  });

  it("supports explicitly enabled deployed test environments", () => {
    process.env.NODE_ENV = "production";
    process.env.VENDOR_ONBOARDING_TEST_VERIFICATION = "true";
    expect(isTestEmailVerificationEnabled()).toBe(true);
  });
});
