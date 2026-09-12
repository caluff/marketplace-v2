import { getGoogleAuthConfiguration } from "../google-auth-configuration";

it("does not enable Google when no credentials are configured", () => {
  expect(getGoogleAuthConfiguration({})).toBeUndefined();
});

it("rejects partial credentials and insecure production callbacks without disclosing secrets", () => {
  expect(() => getGoogleAuthConfiguration({ GOOGLE_CLIENT_SECRET: "private-value" })).toThrow("requires GOOGLE_CLIENT_ID");
  expect(() => getGoogleAuthConfiguration({ GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "private-value", GOOGLE_CALLBACK_URL: "http://marketplace.test/callback" })).toThrow("must use HTTPS");
});

it("accepts local and HTTPS callback configuration", () => {
  for (const callbackUrl of ["http://localhost:3000/auth/google/callback", "https://marketplace.test/auth/google/callback"]) {
    expect(getGoogleAuthConfiguration({ GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_CALLBACK_URL: callbackUrl })).toEqual({ clientId: "client", clientSecret: "secret", callbackUrl });
  }
});
