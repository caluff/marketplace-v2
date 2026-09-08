import type { PriceDTO, ShippingOptionDTO } from "@medusajs/types";
import type { HttpTypes } from "@mercurjs/types";
import { scopedClient, type AuthorizeVendor } from "../workspace/operations";
import { resourceId, textField } from "../workspace/validation";
import { usdAmount } from "../offers/operations";

export type ShippingOptionWithPrices = ShippingOptionDTO & {
  prices?: Pick<
    PriceDTO,
    | "id"
    | "amount"
    | "currency_code"
    | "min_quantity"
    | "max_quantity"
    | "price_rules"
  >[];
};

export function shippingOptionState(option: ShippingOptionWithPrices) {
  const prices =
    option.prices?.filter((price) => price.currency_code === "usd") ?? [];
  const amount = prices.length === 1 ? Number(prices[0].amount) : NaN;
  return {
    editable:
      option.metadata?.marketplace_v2_shipping === true &&
      option.price_type === "flat" &&
      option.prices?.length === 1 &&
      prices[0]?.min_quantity == null &&
      prices[0]?.max_quantity == null &&
      Array.isArray(prices[0]?.price_rules) &&
      prices[0].price_rules.length === 0 &&
      Number.isFinite(amount) &&
      amount >= 0 &&
      amount <= 1_000_000,
    amount: Number.isFinite(amount) ? String(amount) : "",
    enabled:
      option.rules?.some(
        (rule) =>
          rule.attribute === "enabled_in_store" &&
          rule.operator === "eq" &&
          String(
            typeof rule.value === "object" &&
              rule.value !== null &&
              "value" in rule.value
              ? rule.value.value
              : rule.value,
          ) === "true",
      ) ?? false,
  };
}

export async function shippingConfiguration(
  client: ReturnType<typeof scopedClient>,
) {
  const [profiles, options, locations] = await Promise.all([
    client.get<HttpTypes.VendorShippingProfileListResponse>(
      "/vendor/shipping-profiles",
      { limit: 100, fields: "id,name,metadata" },
    ),
    client.get<
      Omit<HttpTypes.VendorShippingOptionListResponse, "shipping_options"> & {
        shipping_options: ShippingOptionWithPrices[];
      }
    >("/vendor/shipping-options", {
      limit: 100,
      fields:
        "id,name,shipping_profile_id,price_type,metadata,type.description,rules.attribute,rules.operator,rules.value,prices.id,prices.amount,prices.currency_code,prices.min_quantity,prices.max_quantity,prices.price_rules.attribute,prices.price_rules.value",
    }),
    client.get<HttpTypes.VendorStockLocationListResponse>(
      "/vendor/stock-locations",
      { limit: 2, fields: "id,name,address.*" },
    ),
  ]);
  if (
    profiles.count > profiles.shipping_profiles.length ||
    options.count > options.shipping_options.length
  )
    throw new Error(
      "Hay más configuraciones de las que se pueden mostrar. Contacta con soporte para revisar tus envíos.",
    );
  return {
    profiles: profiles.shipping_profiles,
    options: options.shipping_options,
    locations,
  };
}

export function shippingOperations(authorize: AuthorizeVendor) {
  return {
    async save(form: FormData) {
      const client = scopedClient(await authorize());
      const action = textField(form, "action", true);
      const name = textField(form, "name", true, 100);
      if (action === "create_profile" || action === "update_profile") {
        return client.post<{ success: boolean }>(
          "/vendor/shipping-configuration",
          {
            action,
            name,
            ...(action === "update_profile"
              ? { profile_id: resourceId(textField(form, "profile_id", true)) }
              : {}),
          },
        );
      }
      if (action !== "create_option" && action !== "update_option")
        throw new Error("La operación de envío no es válida.");
      const description = textField(form, "description", true, 500);
      const amount = usdAmount(textField(form, "amount", true));
      if (amount > 1_000_000)
        throw new Error("La tarifa no puede superar 1.000.000 USD.");
      const enabled = textField(form, "enabled");
      if (
        action === "update_option" &&
        enabled !== "true" &&
        enabled !== "false"
      )
        throw new Error("Selecciona un estado válido para la tarifa.");
      return client.post<{ success: boolean }>(
        "/vendor/shipping-configuration",
        {
          action,
          name,
          description,
          amount,
          ...(action === "create_option"
            ? {
                shipping_profile_id: resourceId(
                  textField(form, "shipping_profile_id", true),
                ),
              }
            : {
                option_id: resourceId(textField(form, "option_id", true)),
                enabled: enabled === "true",
              }),
        },
      );
    },
  };
}
