import {
  buildAuthEmailUrl,
  getAuthEmailConfiguration,
  isAuthActor,
} from "../auth-email";
import authPasswordResetHandler, {
  config as passwordResetConfig,
} from "../../subscribers/auth-password-reset";
import authVerificationRequestedHandler, {
  config as verificationConfig,
} from "../../subscribers/auth-verification-requested";

describe("auth email contracts", () => {
  const environment = {
    STOREFRONT_URL: "https://shop.example.com",
    ADMIN_URL: "https://admin.example.com",
    VENDOR_URL: "https://vendor.example.com",
  };

  it.each([
    ["customer", "https://shop.example.com/reset-password"],
    ["user", "https://admin.example.com/reset-password"],
    ["member", "https://vendor.example.com/seller/reset-password"],
  ] as const)("routes reset links for %s", (actor, expected) => {
    const url = new URL(
      buildAuthEmailUrl(
        "password-reset",
        actor,
        "secret value",
        "person@example.com",
        environment,
      )!,
    );

    expect(`${url.origin}${url.pathname}`).toBe(expected);
    expect(url.searchParams.get("token")).toBe("secret value");
    expect(url.searchParams.get("email")).toBe("person@example.com");
  });

  it("routes vendor verification links without persisting the code", () => {
    const url = new URL(
      buildAuthEmailUrl(
        "email-verification",
        "member",
        "012345",
        "member@example.com",
        environment,
      )!,
    );

    expect(url.pathname).toBe("/seller/verify-email");
    expect(url.searchParams.get("code")).toBe("012345");
  });

  it("rejects unsafe or malformed application URLs", () => {
    expect(
      buildAuthEmailUrl("password-reset", "customer", "token", "a@b.co", {
        STOREFRONT_URL: "javascript:alert(1)",
      }),
    ).toBeNull();
    expect(
      buildAuthEmailUrl("password-reset", "user", "token", "a@b.co", {
        ADMIN_URL: "https://name:password@example.com",
      }),
    ).toBeNull();
  });

  it("keeps outbound email disabled unless explicitly configured", () => {
    expect(getAuthEmailConfiguration({})).toEqual({ enabled: false });
    expect(() =>
      getAuthEmailConfiguration({ AUTH_EMAIL_ENABLED: "true" }),
    ).toThrow("AUTH_EMAIL_FROM");
    expect(
      getAuthEmailConfiguration({
        AUTH_EMAIL_ENABLED: "true",
        AUTH_EMAIL_FROM: "Marketplace <noreply@example.com>",
      }),
    ).toEqual({
      enabled: true,
      from: "Marketplace <noreply@example.com>",
    });
  });

  it("accepts only supported actors", () => {
    expect(isAuthActor("customer")).toBe(true);
    expect(isAuthActor("user")).toBe(true);
    expect(isAuthActor("member")).toBe(true);
    expect(isAuthActor("seller")).toBe(false);
  });

  it("maps password reset events to the notification contract", async () => {
    const createNotifications = jest.fn().mockResolvedValue({});
    const environment = {
      AUTH_EMAIL_ENABLED: process.env.AUTH_EMAIL_ENABLED,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
      STOREFRONT_URL: process.env.STOREFRONT_URL,
    };
    process.env.AUTH_EMAIL_ENABLED = "true";
    process.env.AUTH_EMAIL_FROM = "noreply@example.com";
    process.env.STOREFRONT_URL = "https://shop.example.com";

    try {
      await authPasswordResetHandler({
        event: {
          data: {
            entity_id: "customer@example.com",
            token: "reset-token",
            actor_type: "customer",
          },
        },
        container: { resolve: jest.fn(() => ({ createNotifications })) },
      } as never);
    } finally {
      for (const [key, value] of Object.entries(environment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(passwordResetConfig.event).toBe("auth.password_reset");
    expect(createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "customer@example.com",
        template: "auth-password-reset",
        trigger_type: "auth.password_reset",
        data: {
          reset_url:
            "https://shop.example.com/reset-password?token=reset-token&email=customer%40example.com",
        },
      }),
    );
  });

  it("routes verification events using actor metadata", async () => {
    const createNotifications = jest.fn().mockResolvedValue({});
    const environment = {
      AUTH_EMAIL_ENABLED: process.env.AUTH_EMAIL_ENABLED,
      AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
      VENDOR_URL: process.env.VENDOR_URL,
    };
    process.env.AUTH_EMAIL_ENABLED = "true";
    process.env.AUTH_EMAIL_FROM = "noreply@example.com";
    process.env.VENDOR_URL = "https://vendor.example.com";

    try {
      await authVerificationRequestedHandler({
        event: {
          data: {
            entity_id: "member@example.com",
            entity_type: "email",
            code: "verification-code",
            expires_at: "2026-09-04T18:00:00.000Z",
            metadata: { actor_type: "member" },
          },
        },
        container: { resolve: jest.fn(() => ({ createNotifications })) },
      } as never);
    } finally {
      for (const [key, value] of Object.entries(environment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(verificationConfig.event).toBe("auth.verification_requested");
    expect(createNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "auth-email-verification",
        trigger_type: "auth.verification_requested",
        data: expect.objectContaining({
          verification_url:
            "https://vendor.example.com/seller/verify-email?code=verification-code&email=member%40example.com",
        }),
      }),
    );
  });
});
