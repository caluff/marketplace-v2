import Medusa, { FetchError } from "@medusajs/js-sdk";
import type { HttpTypes as MercurHttpTypes, SellerMemberDTO } from "@mercurjs/types";
import { cookies } from "next/headers";

import {
  VENDOR_MFA_COOKIE,
  VENDOR_RESET_COOKIE,
  VENDOR_SELLER_COOKIE,
  VENDOR_SESSION_COOKIE,
  VENDOR_VERIFICATION_CODE_COOKIE,
  VENDOR_VERIFICATION_COOKIE,
  jwtMaxAge,
  packSecret,
  unpackSecret,
} from "@/lib/auth-utils";

type MfaSecret = { token: string; challengeId: string; methods: string[] };
type VerificationSecret = { token: string; email: string };
type ResetSecret = { token: string; email?: string };

function backendUrl() {
  const value = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function createVendorSdk(token?: string) {
  const baseUrl = backendUrl();
  if (!baseUrl) return null;
  return new Medusa({
    baseUrl,
    debug: false,
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
    globalHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

const secure = process.env.NODE_ENV === "production";

export async function setVendorSession(token: string) {
  const store = await cookies();
  store.set(VENDOR_SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: jwtMaxAge(token) });
  store.delete(VENDOR_MFA_COOKIE);
  store.delete(VENDOR_RESET_COOKIE);
  store.delete(VENDOR_VERIFICATION_COOKIE);
  store.delete(VENDOR_VERIFICATION_CODE_COOKIE);
}

export async function setVendorSeller(sellerId: string) {
  (await cookies()).set(VENDOR_SELLER_COOKIE, sellerId, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 604_800 });
}

export async function clearVendorSeller() {
  (await cookies()).delete(VENDOR_SELLER_COOKIE);
}

export async function clearVendorSession() {
  const store = await cookies();
  store.delete(VENDOR_SESSION_COOKIE);
  store.delete(VENDOR_SELLER_COOKIE);
  store.delete(VENDOR_MFA_COOKIE);
  store.delete(VENDOR_RESET_COOKIE);
  store.delete(VENDOR_VERIFICATION_COOKIE);
  store.delete(VENDOR_VERIFICATION_CODE_COOKIE);
}

export async function getVendorToken() {
  return (await cookies()).get(VENDOR_SESSION_COOKIE)?.value;
}

export async function getSelectedSellerId() {
  return (await cookies()).get(VENDOR_SELLER_COOKIE)?.value;
}

export async function setVendorMfa(secret: MfaSecret) {
  (await cookies()).set(VENDOR_MFA_COOKIE, packSecret(secret), { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 600 });
}

export async function getVendorMfa() {
  return unpackSecret<MfaSecret>((await cookies()).get(VENDOR_MFA_COOKIE)?.value);
}

export async function setVendorVerification(secret: VerificationSecret) {
  (await cookies()).set(VENDOR_VERIFICATION_COOKIE, packSecret(secret), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 1800 });
}

export async function getVendorVerification() {
  return unpackSecret<VerificationSecret>((await cookies()).get(VENDOR_VERIFICATION_COOKIE)?.value);
}

export async function getVendorVerificationCode() {
  return (await cookies()).get(VENDOR_VERIFICATION_CODE_COOKIE)?.value;
}

export async function clearVendorVerification() {
  const store = await cookies();
  store.delete(VENDOR_VERIFICATION_COOKIE);
  store.delete(VENDOR_VERIFICATION_CODE_COOKIE);
}

export async function getVendorReset() {
  return unpackSecret<ResetSecret>((await cookies()).get(VENDOR_RESET_COOKIE)?.value);
}

export async function clearVendorReset() {
  (await cookies()).delete(VENDOR_RESET_COOKIE);
}

export async function listVendorMemberships(token: string) {
  const sdk = createVendorSdk(token);
  if (!sdk) throw new Error("configuration_missing");
  const response = await sdk.client.fetch<MercurHttpTypes.VendorSellerMemberListResponse>("/vendor/sellers");
  return response.seller_members;
}

export async function selectAndRetrieveVendor(token: string, sellerId: string) {
  const sdk = createVendorSdk(token);
  if (!sdk) throw new Error("configuration_missing");
  await sdk.client.fetch<{ success: boolean }>("/vendor/sellers/select", {
    method: "POST",
    body: { seller_id: sellerId },
  });
  const response = await sdk.client.fetch<MercurHttpTypes.VendorSellerMemberResponse>("/vendor/members/me", {
    headers: { "x-seller-id": sellerId },
  });
  return response.seller_member;
}

export type VendorContextResult =
  | { status: "authenticated"; membership: SellerMemberDTO; membershipCount: number }
  | { status: "unauthenticated" | "forbidden" | "seller_missing" | "member_inactive" | "configuration_missing" };

export async function getVendorContext(): Promise<VendorContextResult> {
  const token = await getVendorToken();
  const sellerId = await getSelectedSellerId();
  if (!token) return { status: "unauthenticated" };
  if (!sellerId) return { status: "seller_missing" };

  try {
    const memberships = await listVendorMemberships(token);
    const selected = memberships.find((entry) => entry.seller.id === sellerId);
    if (!selected) return { status: "seller_missing" };
    if (!selected.member?.is_active) return { status: "member_inactive" };
    const membership = await selectAndRetrieveVendor(token, sellerId);
    if (!membership.member?.is_active) return { status: "member_inactive" };
    if (membership.seller.id !== sellerId) return { status: "forbidden" };
    return { status: "authenticated", membership, membershipCount: memberships.length };
  } catch (error) {
    if (error instanceof FetchError) {
      if (error.status === 401) return { status: "unauthenticated" };
      if (error.status === 403) return { status: "forbidden" };
      if (error.status === 404) return { status: "seller_missing" };
    }
    if (error instanceof Error && error.message === "configuration_missing") return { status: "configuration_missing" };
    return { status: "forbidden" };
  }
}
