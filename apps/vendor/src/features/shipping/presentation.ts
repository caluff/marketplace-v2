import type { ShippingProfileDTO } from "@medusajs/types";

export function shippingProfileName(
  profile: Pick<ShippingProfileDTO, "name" | "metadata">,
) {
  const displayName = profile.metadata?.marketplace_v2_display_name;
  return typeof displayName === "string" && displayName.trim()
    ? displayName
    : profile.name;
}
