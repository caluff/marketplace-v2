import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { isValid } from "date-fns/isValid";
import { parseISO } from "date-fns/parseISO";
import { getStripeConnectConfiguration } from "../stripe-connect-configuration";
import type { readOrderFinance } from "./read";
import { decimal } from "./policy";

export const AUTOMATIC_SETTLEMENT_DELAY_MS = 72 * 60 * 60 * 1000;
export const MAX_AUTOMATIC_SETTLEMENTS = 25;

export function automaticSettlementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED !== "true") return false;
  const configuration = getStripeConnectConfiguration(env);
  return Boolean(configuration && !configuration.jobsEnabled);
}

const instant = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) => (typeof value === "string" ? parseISO(value) : value))
  .refine(isValid, "A valid completion instant is required.");
export const orderCompletionSchema = z
  .object({
    id: z.string().startsWith("order_"),
    group_id: z.string().min(1),
    cart_id: z.string().min(1),
    seller_id: z.string().min(1),
    registration_token: z.uuid(),
    completed_at: instant,
    eligible_at: instant,
    observed_order_updated_at: instant,
  })
  .refine(
    (value) =>
      value.eligible_at.getTime() - value.completed_at.getTime() ===
      AUTOMATIC_SETTLEMENT_DELAY_MS,
    "The completion retention must be exactly 72 elapsed hours.",
  );
export type OrderCompletion = z.infer<typeof orderCompletionSchema>;

const quantity = decimal
  .transform(Number)
  .pipe(z.number().int().nonnegative().safe());
const completedOrderSchema = z.object({
  id: z.string(),
  status: z.literal("completed"),
  updated_at: instant,
  items: z
    .array(
      z.object({
        quantity,
        requires_shipping: z.boolean(),
        detail: z.object({
          fulfilled_quantity: quantity,
          shipped_quantity: quantity,
          delivered_quantity: quantity,
        }),
      }),
    )
    .min(1),
});

export async function assertAutomaticSettlementEligible(
  container: MedusaContainer,
  current: Awaited<ReturnType<typeof readOrderFinance>>,
  completion: OrderCompletion,
  now: number,
) {
  completion = orderCompletionSchema.parse(completion);
  const order = current.group.orders.find(
    (entry) => entry.id === completion.id,
  );
  if (
    !automaticSettlementEnabled() ||
    !Number.isFinite(now) ||
    completion.eligible_at.getTime() > now ||
    current.group.id !== completion.group_id ||
    current.group.cart_id !== completion.cart_id ||
    order?.status !== "completed" ||
    order.seller.id !== completion.seller_id ||
    current.original?.order_id !== completion.id ||
    current.original.seller_id !== completion.seller_id
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El pedido todavía no cumple la retención de 72 horas desde su finalización verificada.",
    );

  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [sellers, orders] = await Promise.all([
    query.graph(
      {
        entity: "seller",
        fields: ["id", "status"],
        filters: { id: completion.seller_id },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "order",
        fields: [
          "id",
          "status",
          "updated_at",
          "items.quantity",
          "items.requires_shipping",
          "items.detail.fulfilled_quantity",
          "items.detail.shipped_quantity",
          "items.detail.delivered_quantity",
        ],
        filters: { id: completion.id },
      },
      { cache: { enable: false } },
    ),
  ]);
  if (
    sellers.data.length !== 1 ||
    sellers.data[0].id !== completion.seller_id ||
    sellers.data[0].status !== "open"
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La tienda debe estar activa para recibir la liquidación automática.",
    );
  const parsed = completedOrderSchema.safeParse(orders.data[0]);
  if (
    parsed.success &&
    parsed.data.updated_at.getTime() !==
      completion.observed_order_updated_at.getTime()
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El pedido cambió después de registrar su finalización y requiere revisión manual.",
    );
  if (
    orders.data.length !== 1 ||
    !parsed.success ||
    parsed.data.id !== completion.id ||
    parsed.data.items.some(
      (item) =>
        item.quantity <= 0 ||
        item.detail.fulfilled_quantity !== item.quantity ||
        item.detail.shipped_quantity > item.quantity ||
        item.detail.delivered_quantity > item.quantity ||
        (item.requires_shipping &&
          Math.max(
            item.detail.shipped_quantity,
            item.detail.delivered_quantity,
          ) < item.quantity),
    )
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La preparación y el envío del pedido requieren revisión antes de liquidar automáticamente.",
    );
}
