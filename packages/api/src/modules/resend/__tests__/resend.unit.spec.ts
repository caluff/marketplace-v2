import { Resend } from "resend";
import { getResendConfiguration } from "../configuration";
import { getAuthEmailConfiguration } from "../../../lib/auth-email";
import ResendNotificationProviderService from "../service";
import { renderNotification } from "../templates";

jest.mock("resend", () => ({ Resend: jest.fn() }));

const options = { api_key: "re_unit_test_only", from: "Marketplace <mail@example.com>", production: false };
const notification = {
  channel: "email", to: "person@example.com", template: "auth-password-reset",
  idempotency_key: "event-one", data: { reset_url: "https://example.com/reset?token=secret&email=a%40b.com" },
};

describe("Resend notification provider", () => {
  const send = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    send.mockReset().mockResolvedValue({ data: { id: "resend-one" }, error: null });
    jest.mocked(Resend).mockImplementation(() => ({ emails: { send } }) as unknown as Resend);
  });

  it("uses the configured sender, both bodies, and stable SDK request idempotency", async () => {
    const provider = new ResendNotificationProviderService({}, options);
    await expect(provider.send(notification)).resolves.toEqual({ id: "resend-one" });
    await provider.send({ ...notification });
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: options.from, to: notification.to,
      subject: "Marketplace V2: restablecé tu contraseña",
      html: expect.stringContaining("&amp;email="),
      text: expect.stringContaining("&email="),
    }), { idempotencyKey: expect.stringMatching(/^medusa-email\/[a-f0-9]{64}$/) });
    const nextNotification = { ...notification, idempotency_key: "event-two" };
    await provider.send(nextNotification);
    expect(send.mock.calls[2][1]).not.toEqual(send.mock.calls[0][1]);
    expect(send.mock.calls[0][0]).not.toHaveProperty("template");
  });

  it.each([
    { error: { message: "private provider detail", name: "validation_error", statusCode: 403 }, data: null },
    { error: null, data: null },
    { error: null, data: {} },
  ])("rejects unsuccessful SDK responses instead of acknowledging delivery", async (response) => {
    send.mockResolvedValue(response);
    await expect(new ResendNotificationProviderService({}, options).send(notification)).rejects.toThrow("Email was not accepted");
  });

  it("sanitizes transport errors and retries with the same key", async () => {
    const provider = new ResendNotificationProviderService({}, options);
    send.mockRejectedValueOnce(new Error("secret request payload"));
    await expect(provider.send(notification)).rejects.toThrow("Email request failed");
    await expect(provider.send(notification)).resolves.toEqual({ id: "resend-one" });
    expect(send.mock.calls[0][1]).toEqual(send.mock.calls[1][1]);
  });

  it.each([
    { channel: "sms" }, { from: "attacker@example.com" }, { to: "a@example.com,b@example.com" },
    { idempotency_key: "" }, { template: "__proto__" }, { template: "constructor" },
    { template: "not-allowed", content: { text: "bypass" } },
    { data: { reset_url: "javascript:alert(1)" } },
    { data: { reset_url: "https://user:secret@example.com" } },
  ])("rejects invalid routing or content before touching the SDK: %j", async (changes) => {
    await expect(new ResendNotificationProviderService({}, options).send({ ...notification, ...changes })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("Resend configuration", () => {
  it.each([undefined, "false", "TRUE", "1"])("stays disabled unless explicitly enabled: %s", (enabled) => {
    expect(getResendConfiguration({ AUTH_EMAIL_ENABLED: enabled })).toBeNull();
  });
  it.each([
    {}, { RESEND_API_KEY: "invalid", AUTH_EMAIL_FROM: "a@example.com" },
    { RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "bad sender" },
    { RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "a@example.com\r\nBcc: b@example.com" },
    { RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "a@example.com,b@example.com" },
    { RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "Test <onboarding@RESEND.DEV>", NODE_ENV: "production" },
    { RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "a@mail.resend.dev", NODE_ENV: "production" },
  ])("fails closed for invalid enabled configuration: %j", (environment) => {
    expect(() => getResendConfiguration({ ...environment, AUTH_EMAIL_ENABLED: "true" })).toThrow("[resend]");
  });
  it("allows a production custom sender and a development testing sender", () => {
    expect(getResendConfiguration({ AUTH_EMAIL_ENABLED: "true", RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: options.from, NODE_ENV: "production" })).toEqual({ ...options, api_key: "re_test", production: true });
    expect(getResendConfiguration({ AUTH_EMAIL_ENABLED: "true", RESEND_API_KEY: "re_test", AUTH_EMAIL_FROM: "onboarding@resend.dev" })?.from).toBe("onboarding@resend.dev");
  });
  it.each([undefined, "Legacy <legacy@example.com>"])("uses RESEND_FROM_EMAIL consistently for provider and auth with legacy sender %s", (legacySender) => {
    const environment = {
      AUTH_EMAIL_ENABLED: "true", RESEND_API_KEY: "re_test",
      RESEND_FROM_EMAIL: " marketplace-v2 <onboarding@resend.dev> ",
      AUTH_EMAIL_FROM: legacySender,
    };
    expect(getResendConfiguration(environment)?.from).toBe("marketplace-v2 <onboarding@resend.dev>");
    expect(getAuthEmailConfiguration(environment)).toEqual({ enabled: true, from: "marketplace-v2 <onboarding@resend.dev>" });
  });
  it("does not silently fall back from an explicitly empty sender", () => {
    const environment = { AUTH_EMAIL_ENABLED: "true", RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: " ", AUTH_EMAIL_FROM: options.from };
    expect(() => getResendConfiguration(environment)).toThrow("[resend]");
    expect(() => getAuthEmailConfiguration(environment)).toThrow("[auth-email]");
  });
  it.each([
    { RESEND_FROM_EMAIL: "bad sender" },
    { RESEND_FROM_EMAIL: "a@example.com\r\nBcc: b@example.com" },
    { RESEND_FROM_EMAIL: "marketplace-v2 <onboarding@resend.dev>", NODE_ENV: "production" },
  ])("retains sender safety checks for RESEND_FROM_EMAIL: %j", (environment) => {
    expect(() => getResendConfiguration({ AUTH_EMAIL_ENABLED: "true", RESEND_API_KEY: "re_test", ...environment })).toThrow("[resend]");
  });
});

describe("local notification templates", () => {
  it.each(["submitted", "changes_requested", "approved", "rejected"] as const)("renders %s with escaped feedback and readable plain text", (status) => {
    const output = renderNotification(`vendor-application-${status}`, { application_id: "app_<one>", status, reason: '<script>alert("x")</script> & feedback\nnext line' });
    expect(output.subject).toMatch(/^Marketplace V2:/);
    expect(output.html).toContain("Marketplace V2");
    expect(output.text).toContain("Marketplace V2");
    expect(output.html).not.toContain("<script>");
    expect(output.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; feedback<br>next line");
    expect(output.html).toContain("app_&lt;one&gt;");
    expect(output.text).toContain('<script>alert("x")</script> & feedback\nnext line');
  });
  it("renders verification expiration identically after event serialization", () => {
    const input = { verification_url: "https://example.com/verify?code=one&next=%2Faccount%2Fsell", expires_at: "2026-09-04T18:00:00.000Z" };
    const rendered = renderNotification("auth-email-verification", input);
    expect(rendered.subject).toBe("Marketplace V2: verificá tu correo");
    expect(rendered).toEqual(renderNotification("auth-email-verification", { ...input, expires_at: new Date(input.expires_at) }));
    expect(rendered.text).toContain(input.verification_url);
    expect(rendered.html).toContain("&amp;next=");
  });
  it("rejects mismatched lifecycle statuses and malformed verification expiration", () => {
    expect(() => renderNotification("vendor-application-approved", { application_id: "one", status: "rejected" })).toThrow();
    expect(() => renderNotification("auth-email-verification", { verification_url: "https://example.com", expires_at: "bad" })).toThrow();
  });
});
