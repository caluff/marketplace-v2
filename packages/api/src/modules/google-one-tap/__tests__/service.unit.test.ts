import { generateKeyPairSync, sign } from "node:crypto";
import type { AuthenticationInput, AuthIdentityDTO, AuthIdentityProviderService, ILockingModule, Logger } from "@medusajs/framework/types";
import { MedusaError } from "@medusajs/framework/utils";
import { createGoogleOneTapTransaction, googleOneTapRedemptionKey } from "../../../lib/google-one-tap/transaction";
import GoogleOneTapAuthService from "../service";

const CLIENT_ID = "one-tap-unit.apps.googleusercontent.com";
const SECRET = "one-tap-unit-secret-at-least-32-characters";
const key = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKey = key.publicKey.export({ type: "spki", format: "pem" }).toString();
const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } as unknown as Logger;
const identity: AuthIdentityDTO = { id: "auth_one_tap", app_metadata: {}, provider_identities: [] };

class LocalGoogleService extends GoogleOneTapAuthService {
  useLocalSigningKey() {
    // Replace key transport only: the installed provider's JWT verifier remains real.
    Object.defineProperty(this, "getSigningKey_", {
      value: (header: { kid?: string }, callback: (error: Error | null, key?: string) => void) => header.kid === "one-tap-unit"
        ? callback(null, publicKey) : callback(new Error("Unknown local signing key")),
    });
  }
}

function signedCredential(nonce: string, changes: Record<string, unknown> = {}, headerChanges: Record<string, unknown> = {}) {
  const seconds = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "one-tap-unit", ...headerChanges })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: "google-one-tap-unit-sub", email: "one-tap-unit@gmail.com", email_verified: true,
    iss: "https://accounts.google.com", aud: CLIENT_ID, iat: seconds, exp: seconds + 3600,
    nonce, given_name: "Unit", family_name: "Test", ...changes,
  })).toString("base64url");
  const input = `${header}.${payload}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), key.privateKey).toString("base64url")}`;
}

function fixture() {
  const redeemed = new Set<string>();
  const acquire = jest.fn(async (key: string) => {
    if (redeemed.has(key)) throw new Error("Transaction already redeemed");
    redeemed.add(key);
  });
  const locking = { acquire } as unknown as ILockingModule;
  const identities: AuthIdentityProviderService = {
    retrieve: jest.fn().mockResolvedValue(identity), create: jest.fn().mockResolvedValue(identity),
    update: jest.fn(), setState: jest.fn(), getState: jest.fn(),
  };
  const service = new LocalGoogleService({ logger, locking }, {
    clientId: CLIENT_ID, clientSecret: "unused-unit-client-secret", callbackUrl: "http://localhost:3000/auth/google/callback",
    oneTapSecret: SECRET,
  });
  service.useLocalSigningKey();
  const transaction = createGoogleOneTapTransaction(CLIENT_ID, SECRET);
  const request: AuthenticationInput & { actor_type: string } = {
    actor_type: "customer", url: "/auth/customer/google", body: {
      id_token: signedCredential(transaction.nonce), transaction_token: transaction.transaction_token,
    },
  };
  return { service, identities, transaction, request, acquire };
}

it("uses the native verified Google subject and consumes the transaction before identity access", async () => {
  const f = fixture();
  jest.mocked(f.identities.retrieve).mockImplementation(async () => {
    expect(f.acquire).toHaveBeenCalledTimes(1);
    return identity;
  });
  expect(await f.service.authenticate(f.request, f.identities)).toEqual({ success: true, authIdentity: identity });
  expect(f.identities.retrieve).toHaveBeenCalledWith({ entity_id: "google-one-tap-unit-sub" });
  expect(f.acquire).toHaveBeenCalledWith(googleOneTapRedemptionKey(f.transaction.transaction_token), expect.objectContaining({
    ownerId: expect.any(String), expire: expect.any(Number),
  }));
  expect(f.identities.create).not.toHaveBeenCalled();
});

it("lets the native provider create a missing Google identity only after nonce validation and redemption", async () => {
  const f = fixture();
  jest.mocked(f.identities.retrieve).mockRejectedValue(new MedusaError(MedusaError.Types.NOT_FOUND, "Missing identity"));
  expect((await f.service.authenticate(f.request, f.identities)).success).toBe(true);
  expect(f.identities.create).toHaveBeenCalledWith(expect.objectContaining({
    entity_id: "google-one-tap-unit-sub", user_metadata: expect.objectContaining({ email: "one-tap-unit@gmail.com" }),
  }));
  expect(f.acquire).toHaveBeenCalledTimes(1);
});

it("rejects signature, issuer, audience, expiration, nonce and strict Google claims before touching identities", async () => {
  const seconds = Math.floor(Date.now() / 1000);
  for (const changes of [
    { iss: "https://attacker.example.test" }, { aud: "different-client" }, { exp: seconds - 1 }, { exp: null },
    { iat: seconds + 61 }, { iat: null }, { nonce: "A".repeat(43) }, { nonce: null },
    { email_verified: false }, { email_verified: "true" }, { sub: null }, { email: "invalid" },
  ]) {
    const f = fixture();
    f.request.body!.id_token = signedCredential(f.transaction.nonce, changes);
    expect((await f.service.authenticate(f.request, f.identities)).success).toBe(false);
    expect(f.identities.retrieve).not.toHaveBeenCalled();
    expect(f.identities.create).not.toHaveBeenCalled();
    expect(f.acquire).not.toHaveBeenCalled();
  }
  for (const header of [{ kid: "untrusted-key" }, { alg: "HS256" }]) {
    const f = fixture();
    f.request.body!.id_token = signedCredential(f.transaction.nonce, {}, header);
    expect((await f.service.authenticate(f.request, f.identities)).success).toBe(false);
    expect(f.identities.retrieve).not.toHaveBeenCalled();
    expect(f.acquire).not.toHaveBeenCalled();
  }
  const f = fixture();
  const pieces = f.request.body!.id_token.split(".");
  pieces[1] = Buffer.from(JSON.stringify({ sub: "forged" })).toString("base64url");
  f.request.body!.id_token = pieces.join(".");
  expect((await f.service.authenticate(f.request, f.identities)).success).toBe(false);
  expect(f.identities.retrieve).not.toHaveBeenCalled();
  expect(f.acquire).not.toHaveBeenCalled();
});

it("does not extend One Tap to other actors, routes, mixed OAuth inputs or oversized credentials", async () => {
  const requestChanges: Array<Partial<AuthenticationInput> & { actor_type?: string }> = [
    { actor_type: "member" }, { actor_type: "user" }, { url: "/auth/member/google" },
    { query: { code: "oauth-code" } }, { query: { state: "oauth-state" } },
  ];
  for (const changed of requestChanges) {
    const f = fixture();
    expect((await f.service.authenticate({ ...f.request, ...changed }, f.identities)).success).toBe(false);
    expect(f.identities.retrieve).not.toHaveBeenCalled();
    expect(f.acquire).not.toHaveBeenCalled();
  }
  const bodyChanges: Array<Record<string, string>> = [{ code: "oauth-code" }, { id_token: "A".repeat(8193) }, { transaction_token: "invalid" }];
  for (const body of bodyChanges) {
    const f = fixture();
    expect((await f.service.authenticate({ ...f.request, body: { ...f.request.body, ...body } }, f.identities)).success).toBe(false);
    expect(f.identities.retrieve).not.toHaveBeenCalled();
    expect(f.acquire).not.toHaveBeenCalled();
  }
});

it("rejects replay and simultaneous redemption while preserving the native Google identity", async () => {
  const f = fixture();
  const results = await Promise.all([f.service.authenticate(f.request, f.identities), f.service.authenticate(f.request, f.identities)]);
  expect(results.filter(result => result.success)).toHaveLength(1);
  expect(results.filter(result => !result.success)).toHaveLength(1);
  expect(f.identities.retrieve).toHaveBeenCalledTimes(1);
  expect((await f.service.authenticate(f.request, f.identities)).success).toBe(false);
  expect(f.identities.retrieve).toHaveBeenCalledTimes(1);
});

it("fails closed on lock errors and never restores a consumed proof after an identity failure", async () => {
  const f = fixture();
  f.acquire.mockRejectedValueOnce(new Error("Private Redis diagnostic"));
  const locked = await f.service.authenticate(f.request, f.identities);
  expect(locked).toEqual({ success: false, error: "No pudimos iniciar sesión con Google. Inténtalo de nuevo." });
  expect(f.identities.retrieve).not.toHaveBeenCalled();
  jest.mocked(f.identities.retrieve).mockRejectedValueOnce(new Error("Private database diagnostic"));
  expect((await f.service.authenticate(f.request, f.identities)).success).toBe(false);
  expect((await f.service.authenticate(f.request, f.identities)).success).toBe(false);
  expect(f.identities.retrieve).toHaveBeenCalledTimes(1);
});

it("keeps the existing Google OAuth redirect and state flow for requests without One Tap fields", async () => {
  const f = fixture();
  const result = await f.service.authenticate({ body: { callback_url: "http://localhost:3000/auth/google/callback" } }, f.identities);
  expect(result.success).toBe(true);
  expect(result.location).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  expect(f.identities.setState).toHaveBeenCalledWith(expect.any(String), { callback_url: "http://localhost:3000/auth/google/callback" });
  expect(f.acquire).not.toHaveBeenCalled();
});
