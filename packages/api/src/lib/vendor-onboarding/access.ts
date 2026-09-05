import type SellerModule from "@mercurjs/core/modules/seller";
import type { MedusaContainer, IAuthModuleService } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { MercurModules } from "@mercurjs/types";
import type VendorOnboardingService from "../../modules/vendor-onboarding/service";
import { VENDOR_ONBOARDING_MODULE } from "../../modules/vendor-onboarding";
import { OnboardingError } from "./errors";

export type ApplicantIdentity = { customer_id: string; auth_identity_id: string };
export const onboardingService = (container: MedusaContainer) => container.resolve<VendorOnboardingService>(VENDOR_ONBOARDING_MODULE);

export async function loadApplicant(container: MedusaContainer, input: ApplicantIdentity) {
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH);
  const identity = await auth.retrieveAuthIdentity(input.auth_identity_id, { relations: ["provider_identities"] });
  if (identity.app_metadata?.customer_id !== input.customer_id) throw new OnboardingError("identity_changed");
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: customers } = await query.graph({ entity: "customer", fields: ["id", "email", "first_name", "last_name", "has_account"], filters: { id: input.customer_id } }, { cache: { enable: false } });
  const customer = customers[0];
  const provider = identity.provider_identities?.find((entry) => entry.provider === "emailpass");
  if (!customer?.has_account || !provider?.entity_id || provider.entity_id.toLowerCase() !== customer.email?.toLowerCase()) throw new OnboardingError("identity_changed");
  const verifications = await auth.listAuthVerifications({ auth_identity_id: identity.id, entity_type: "email", entity_id: provider.entity_id });
  const emailVerified = verifications.some((entry) => !!entry.verified_at);
  const memberId = identity.app_metadata?.member_id;
  if (memberId != null && typeof memberId !== "string") throw new OnboardingError("member_identity_conflict");
  const sellerService = container.resolve<NativeSellerService>(MercurModules.SELLER);
  const member = memberId ? await sellerService.retrieveMember(memberId) : null;
  const memberships = member ? await sellerService.listSellerMembers({ member_id: member.id }) : [];
  return { customer, identity, email: provider.entity_id, emailVerified, member, memberships };
}

export async function requireReviewer(container: MedusaContainer, userId: string, operation: "read" | "update") {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: users } = await query.graph({ entity: "user", fields: ["id", "rbac_roles.id"], filters: { id: userId } }, { cache: { enable: false } });
  const roles = users[0]?.rbac_roles?.flatMap(role => role ? [role.id] : []) || [];
  const rbac = container.resolve(Modules.RBAC);
  const policies = (await Promise.all(roles.map(id => rbac.listPoliciesForRole(id)))).flat();
  if (!policies.some(policy => ["seller", "*"].includes(policy.resource) && [operation, "*"].includes(policy.operation))) throw new OnboardingError("review_forbidden", 403);
}

export async function requireVendorMembership(container: MedusaContainer, memberId: string, sellerId: string) {
  if (!sellerId) throw new OnboardingError("seller_required", 403);
  const sellerService = container.resolve<NativeSellerService>(MercurModules.SELLER);
  const member = await sellerService.retrieveMember(memberId);
  if (!member.is_active) throw new OnboardingError("member_inactive", 403);
  const memberships = await sellerService.listSellerMembers({ member_id: memberId, seller_id: sellerId });
  if (!memberships.length) throw new OnboardingError("seller_membership_required", 403);
  const seller = await sellerService.retrieveSeller(sellerId);
  return { seller, member, membership: memberships[0] };
}

export async function requireVendorAccess(container: MedusaContainer, memberId: string, sellerId: string) {
  const { seller, member, membership } = await requireVendorMembership(container, memberId, sellerId);
  if (seller.status !== "open") throw new OnboardingError("seller_not_open", 403);
  if (seller.external_id?.startsWith("vendor-application:")) {
    const id = seller.external_id.slice("vendor-application:".length);
    const applications = await onboardingService(container).listVendorApplications({ id, seller_id: seller.id, status: "approved", approval_state: "complete" });
    if (!applications.length) throw new OnboardingError("application_not_approved", 403);
  }
  return { seller, member, membership };
}

type NativeSellerService = InstanceType<typeof SellerModule.service>;
