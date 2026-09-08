import { TableCell } from "@/components/ui/table";
import type { HttpTypes } from "@mercurjs/types";
import { Badge } from "@/components/ui/badge";
import { ProductRowActions } from "./product-row-actions";
import type { scopedClient } from "../workspace/operations";
import { resultOf } from "../workspace/data";
import { formatMoney } from "../workspace/presentation";
import {
  baseUsdPrice,
  OFFER_FIELDS,
  type OfferWithPrices,
} from "../offers/operations";
import {
  sellerWarehouse,
  warehouseLevel,
  type InventoryItemWithLevels,
} from "../inventory/data";

export async function catalogCommerce(
  client: ReturnType<typeof scopedClient>,
  variantIds: string[],
) {
  const warehouse = resultOf(sellerWarehouse(client));
  const seller = resultOf(
    client.get<HttpTypes.VendorSellerResponse>("/vendor/sellers/me", {
      fields: "id,metadata",
    }),
  );
  const offers: OfferWithPrices[] = [];
  if (variantIds.length) {
    let count = 1;
    while (offers.length < count) {
      const page = await client.get<{
        offers: OfferWithPrices[];
        count: number;
      }>("/vendor/offers", {
        variant_id: variantIds,
        limit: 100,
        offset: offers.length,
        fields: `${OFFER_FIELDS},manage_inventory,inventory_items.required_quantity`,
      });
      if (!page.offers.length && offers.length < page.count)
        throw new Error("No se pudo cargar toda la configuración.");
      offers.push(...page.offers);
      count = page.count;
    }
  }
  const inventory = resultOf(
    (async () => {
      const ids = [
        ...new Set(
          offers.flatMap(
            (offer) =>
              offer.inventory_items?.map((item) => item.inventory_item_id) ??
              [],
          ),
        ),
      ];
      const items: InventoryItemWithLevels[] = [];
      for (let index = 0; index < ids.length; index += 100) {
        const batch = ids.slice(index, index + 100);
        const response = await client.get<{
          inventory_items: InventoryItemWithLevels[];
          count: number;
        }>("/vendor/inventory-items", {
          id: batch,
          limit: 100,
          fields:
            "id,title,sku,location_levels.id,location_levels.location_id,location_levels.stocked_quantity,location_levels.reserved_quantity",
        });
        if (response.count > response.inventory_items.length)
          throw new Error("Inventario incompleto");
        items.push(...response.inventory_items);
      }
      return items;
    })(),
  );
  return {
    offers,
    warehouse: await warehouse,
    inventory: await inventory,
    seller: await seller,
  };
}

export async function CatalogSaleActions({
  data,
  productId,
  title,
  variantIds,
}: {
  data: ReturnType<
    typeof resultOf<Awaited<ReturnType<typeof catalogCommerce>>>
  >;
  productId: string;
  title: string;
  variantIds: string[];
}) {
  const result = await data;
  const seller = result.data?.seller.data?.seller;
  const pausedIds = seller?.metadata?.marketplace_v2_paused_products;
  const paused =
    seller && (pausedIds == null || Array.isArray(pausedIds))
      ? Array.isArray(pausedIds) && pausedIds.includes(productId)
      : undefined;
  const configured = result.data?.offers.some((offer) =>
    variantIds.includes(offer.variant_id),
  );
  return (
    <div className="flex items-center gap-2">
      {paused ? <Badge variant="warning">Venta pausada</Badge> : null}
      <ProductRowActions
        productId={productId}
        title={title}
        paused={paused}
        configured={configured}
      />
    </div>
  );
}

export async function CatalogCommerceCells({
  data,
  variantIds,
}: {
  data: ReturnType<
    typeof resultOf<Awaited<ReturnType<typeof catalogCommerce>>>
  >;
  variantIds: string[];
}) {
  const result = await data;
  if (!result.data)
    return (
      <>
        <TableCell>No disponible</TableCell>
        <TableCell>No disponible</TableCell>
      </>
    );
  const offers = result.data.offers.filter((offer) =>
    variantIds.includes(offer.variant_id),
  );
  if (!offers.length)
    return (
      <>
        <TableCell>Sin configurar</TableCell>
        <TableCell>Sin configurar</TableCell>
      </>
    );
  let price = "Revisar precios";
  try {
    const amounts = offers.map((offer) => {
      const base = baseUsdPrice(offer.prices ?? []);
      if (!base || !Number.isFinite(Number(base.amount)))
        throw new Error("Precio incompleto");
      return Number(base.amount);
    });
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    price =
      min === max
        ? formatMoney(min, "USD")
        : `${formatMoney(min, "USD")} – ${formatMoney(max, "USD")}`;
  } catch {
    /* Keep an explicit incomplete-price state. */
  }
  let stock = "No disponible";
  const warehouse = result.data.warehouse.data;
  if (warehouse?.status === "ready") {
    const seen = new Set<string>();
    let total = 0;
    let valid = true;
    for (const offer of offers) {
      const links = offer.inventory_items;
      if (!offer.manage_inventory || links?.length !== 1) {
        valid = false;
        break;
      }
      const link = links[0];
      const item = result.data.inventory.data?.find(
        (item) => item.id === link.inventory_item_id,
      );
      const required = Number(link.required_quantity);
      if (
        !item ||
        seen.has(link.inventory_item_id) ||
        !Number.isSafeInteger(required) ||
        required <= 0
      ) {
        valid = false;
        break;
      }
      seen.add(link.inventory_item_id);
      const level = warehouseLevel(item, warehouse.location.id);
      if (level.status !== "ready") {
        valid = false;
        break;
      }
      total += Math.floor(Math.max(0, level.available) / required);
    }
    if (valid) stock = total === 0 ? "Sin existencias" : `${total} disponibles`;
  }
  return (
    <>
      <TableCell className="tabular-nums">
        {price}
        {offers.length < variantIds.length ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {offers.length} de {variantIds.length} presentaciones configuradas
          </p>
        ) : null}
      </TableCell>
      <TableCell className="tabular-nums">{stock}</TableCell>
    </>
  );
}
