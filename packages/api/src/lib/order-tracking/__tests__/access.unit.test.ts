import { createHmac } from "node:crypto";
import {
  assertTrackingRecipient,
  buildOrderTrackingUrl,
  createOrderTrackingToken,
  ORDER_TRACKING_MAX_AGE_SECONDS,
  verifyOrderTrackingToken,
} from "../access";

const environment = { JWT_SECRET: "tracking-test-secret-32-characters-long", STOREFRONT_URL: "https://shop.example.test" };
const order = { id: "order_Test123", email: "guest@example.test" };
const issuedAt = Date.UTC(2026, 9, 6);

it("binds an opaque recipient digest and expiration to one order", () => {
  const token = createOrderTrackingToken(order, environment, issuedAt);
  const claims = verifyOrderTrackingToken(token, environment, issuedAt);
  expect(claims.order_id).toBe(order.id);
  expect(claims.exp).toBe(issuedAt / 1000 + ORDER_TRACKING_MAX_AGE_SECONDS);
  expect(Buffer.from(token.split(".")[0], "base64url").toString()).not.toContain(order.email);
  expect(() => assertTrackingRecipient(claims.recipient, order.email, environment)).not.toThrow();
  expect(() => assertTrackingRecipient(claims.recipient, "other@example.test", environment)).toThrow("no es válido");
});

it("normalizes recipient case and whitespace and invalidates a changed recipient", () => {
  const claims = verifyOrderTrackingToken(createOrderTrackingToken(order, environment, issuedAt), environment, issuedAt);
  expect(() => assertTrackingRecipient(claims.recipient, " GUEST@example.test ", environment)).not.toThrow();
  expect(() => assertTrackingRecipient(claims.recipient, null, environment)).toThrow("no es válido");
});

it("rejects edited payloads, signatures, noncanonical encoding, and rotated signing keys", () => {
  const token = createOrderTrackingToken(order, environment, issuedAt);
  const [payload, signed] = token.split(".");
  for (const altered of [
    `${payload.slice(0, -1)}A.${signed}`,
    `${payload}.${signed[0] === "A" ? "B" : "A"}${signed.slice(1)}`,
    `${payload}=.${signed}`,
    `${payload}.${signed}x`,
    "order_Test123",
    "a".repeat(2049),
  ]) expect(() => verifyOrderTrackingToken(altered, environment, issuedAt)).toThrow("no es válido");
  expect(() => verifyOrderTrackingToken(token, { JWT_SECRET: "different-test-secret-32-characters" }, issuedAt)).toThrow("no es válido");
});

it("rejects extra claims even with a correctly signed payload", () => {
  const valid = createOrderTrackingToken(order, environment, issuedAt);
  const claims = JSON.parse(Buffer.from(valid.split(".")[0], "base64url").toString());
  const payload = Buffer.from(JSON.stringify({ ...claims, customer_id: "cus_other" })).toString("base64url");
  const key = createHmac("sha256", environment.JWT_SECRET).update("usapeek:order-tracking:v1").digest();
  const signed = createHmac("sha256", key).update(payload).digest("base64url");
  expect(() => verifyOrderTrackingToken(`${payload}.${signed}`, environment, issuedAt)).toThrow("no es válido");
});

it("expires at the exact boundary and keeps retry URLs stable", () => {
  const token = createOrderTrackingToken(order, environment, issuedAt);
  const expiry = issuedAt + ORDER_TRACKING_MAX_AGE_SECONDS * 1000;
  expect(() => verifyOrderTrackingToken(token, environment, expiry - 1)).not.toThrow();
  expect(() => verifyOrderTrackingToken(token, environment, expiry)).toThrow("ha vencido");
  expect(buildOrderTrackingUrl(order, environment, new Date(issuedAt))).toBe(buildOrderTrackingUrl(order, environment, new Date(issuedAt).toISOString()));
  const url = new URL(buildOrderTrackingUrl(order, environment, issuedAt));
  expect(url.origin).toBe(environment.STOREFRONT_URL);
  expect(url.pathname).toBe("/orders/track");
  expect(url.search).toBe("");
  expect(new URLSearchParams(url.hash.slice(1)).get("token")).toBe(token);
});

it("rejects unconfigured signing and unsafe storefront origins", () => {
  expect(() => createOrderTrackingToken(order, {}, issuedAt)).toThrow("not configured");
  for (const STOREFRONT_URL of ["javascript:alert(1)", "https://user:password@shop.example.test", "https://shop.example.test?next=bad", "invalid"]) {
    expect(() => buildOrderTrackingUrl(order, { ...environment, STOREFRONT_URL }, issuedAt)).toThrow("valid public URL");
  }
});
