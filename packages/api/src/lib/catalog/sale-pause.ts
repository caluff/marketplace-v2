import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";

export const PAUSED_PRODUCTS_KEY = "marketplace_v2_paused_products";
export function pausedProducts(
  metadata: Record<string, unknown> | null | undefined,
): string[] {
  const ids = metadata?.[PAUSED_PRODUCTS_KEY];
  if (ids == null) return [];
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid product sale configuration.",
    );
  return ids;
}

export async function assertOffersNotPaused(
  container: MedusaContainer,
  ids: string[],
) {
  if (!ids.length) return;
  const { data: offers } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "offer",
        fields: ["id", "product_id", "seller.id", "seller.metadata"],
        filters: { id: [...new Set(ids)] },
      },
      { cache: { enable: false } },
    );
  if (offers.length !== new Set(ids).size)
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Offer not found.");
  for (const offer of offers) {
    if (
      !offer.seller ||
      pausedProducts(offer.seller.metadata).includes(offer.product_id)
    )
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El vendedor ha pausado la venta de uno de los productos.",
      );
  }
}

export async function assertCartProductsNotPaused(
  container: MedusaContainer,
  cartId: string,
) {
  const { data: carts } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "cart",
        fields: ["id", "completed_at", "items.offer.id"],
        filters: { id: cartId },
      },
      { cache: { enable: false } },
    );
  const cart = carts[0];
  if (!cart)
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Cart not found.");
  if (cart.completed_at) return;
  await assertOffersNotPaused(
    container,
    (cart.items ?? []).flatMap((item) =>
      item?.offer?.id ? [item.offer.id] : [],
    ),
  );
}

export async function assertPaymentCollectionProductsNotPaused(
  container: MedusaContainer,
  paymentCollectionId: string,
) {
  const { data: links } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "cart_payment_collection",
        fields: ["cart_id"],
        filters: { payment_collection_id: paymentCollectionId },
      },
      { cache: { enable: false } },
    );
  if (links.length !== 1 || !links[0].cart_id)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "A checkout cart is required.",
    );
  await assertCartProductsNotPaused(container, links[0].cart_id);
}

export async function assertCartLineIncreaseNotPaused(
  container: MedusaContainer,
  cartId: string,
  lineId: string,
  quantity: number,
) {
  if (quantity === 0) return;
  const { data: carts } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph(
      {
        entity: "cart",
        fields: ["id", "items.id", "items.quantity", "items.offer.id"],
        filters: { id: cartId },
      },
      { cache: { enable: false } },
    );
  const item = carts[0]?.items?.find((item) => item?.id === lineId);
  if (!item)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Cart line item not found.",
    );
  if (quantity > Number(item.quantity) && item.offer?.id) {
    await assertOffersNotPaused(container, [item.offer.id]);
  }
}
