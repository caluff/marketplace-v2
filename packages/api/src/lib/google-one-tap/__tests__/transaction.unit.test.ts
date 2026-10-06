import { createGoogleOneTapTransaction, readGoogleOneTapTransaction } from "../transaction";

const CLIENT_ID = "one-tap-unit.apps.googleusercontent.com";
const SECRET = "one-tap-unit-secret-at-least-32-characters";

it("issues separate encrypted customer transactions and public nonces valid for exactly ten minutes", () => {
  const now = Date.now();
  const first = createGoogleOneTapTransaction(CLIENT_ID, SECRET, now);
  const second = createGoogleOneTapTransaction(CLIENT_ID, SECRET, now);
  expect(first.nonce).not.toBe(second.nonce);
  expect(first.transaction_token).not.toBe(second.transaction_token);
  expect(first.transaction_token).not.toContain(first.nonce);
  const transaction = readGoogleOneTapTransaction(first.transaction_token, CLIENT_ID, SECRET, now);
  expect(transaction).toMatchObject({ actor_type: "customer", auth_provider: "google", client_id: CLIENT_ID, nonce: first.nonce });
  expect(transaction.expires_at - transaction.issued_at).toBe(600);
  expect(first.expires_at).toBe(new Date(transaction.expires_at * 1000).toISOString());
});

it("rejects expired, tampered, other-client and other-secret transaction proofs", () => {
  const now = Date.now();
  const response = createGoogleOneTapTransaction(CLIENT_ID, SECRET, now);
  expect(() => readGoogleOneTapTransaction(response.transaction_token, CLIENT_ID, SECRET, now + 600000)).toThrow();
  expect(() => readGoogleOneTapTransaction(response.transaction_token, "other-client", SECRET, now)).toThrow();
  expect(() => readGoogleOneTapTransaction(response.transaction_token, CLIENT_ID, SECRET + "other", now)).toThrow();
  const parts = response.transaction_token.split(".");
  parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
  expect(() => readGoogleOneTapTransaction(parts.join("."), CLIENT_ID, SECRET, now)).toThrow();
});

it("rejects alternate base64 encodings that would bypass a replay marker hashed from the token", () => {
  const response = createGoogleOneTapTransaction(CLIENT_ID, SECRET);
  const parts = response.transaction_token.split(".");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const last = parts[3][parts[3].length - 1];
  parts[3] = parts[3].slice(0, -1) + alphabet[alphabet.indexOf(last) + 1];
  expect(Buffer.from(parts[3], "base64url")).toEqual(Buffer.from(response.transaction_token.split(".")[3], "base64url"));
  expect(() => readGoogleOneTapTransaction(parts.join("."), CLIENT_ID, SECRET)).toThrow();
});
