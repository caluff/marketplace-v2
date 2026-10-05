import type { ProductDTO } from "@mercurjs/types";
import Link from "next/link";
import type { ReactNode } from "react";
import { PresentationCard } from "../catalog/presentation-card";
import { PresentationEditValue } from "../catalog/presentation-editor";
import { DataError } from "../workspace/components";
import { resultOf, workspace } from "../workspace/data";
import { baseUsdPrice, OFFER_FIELDS, type OfferWithPrices } from "./operations";
import { OfferForm } from "./offer-form";
import type { offerConfiguration } from "./data";
import { createMasterSku } from "../catalog/master-sku";
import { isShippingProfileArchived } from "../shipping/presentation";
import { shippingProfileName } from "../shipping/presentation";
import { formatMoney } from "../workspace/presentation";

export async function ProductOffers({
  product,
  configuration,
  hasPending,
}: {
  product: ProductDTO;
  hasPending: boolean;
  configuration: ReturnType<
    typeof resultOf<Awaited<ReturnType<typeof offerConfiguration>>>
  >;
}) {
  const unavailable = (notice: ReactNode) => (
    <div className="space-y-4">
      {notice}
      {product.variants?.map((variant) => (
        <PresentationCard
          key={variant.id}
          product={product}
          variant={variant}
          hasPending={hasPending}
        />
      ))}
    </div>
  );
  if (product.status !== "published")
    return unavailable(
      <p className="text-sm text-muted-foreground">
        Podrás configurar precios cuando el producto esté publicado y aprobado
        para tu tienda.
      </p>,
    );
  if (!product.variants?.length)
    return (
      <p className="text-sm text-muted-foreground">
        El producto necesita al menos una presentación aprobada para configurar
        su precio.
      </p>
    );
  const { client } = await workspace();
  const result = await resultOf(
    Promise.all([
      client.get<{ offers: OfferWithPrices[]; count: number }>(
        "/vendor/offers",
        {
          variant_id: product.variants.map((variant) => variant.id),
          limit: 100,
          fields: OFFER_FIELDS,
        },
      ),
      configuration,
    ]),
  );
  if (!result.data) return unavailable(<DataError message={result.error} />);
  const [offers, configured] = result.data;
  if (!configured.data)
    return unavailable(<DataError message={configured.error} />);
  const [locations, profiles] = configured.data;
  if (locations.count !== 1 || locations.stock_locations.length !== 1)
    return unavailable(
      <p className="text-sm text-muted-foreground">
        Tu tienda necesita un almacén único validado.{" "}
        <Link href="/seller/inventory/locations" className="underline">
          Revisar almacén
        </Link>
      </p>,
    );
  if (offers.count > offers.offers.length)
    return unavailable(
      <DataError message="Hay más ofertas de las que se pudieron cargar. El operador debe revisar el catálogo antes de editar precios." />,
    );
  if (profiles.count > profiles.shipping_profiles.length)
    return unavailable(
      <DataError message="No se pudieron cargar todos los perfiles de envío. Revisa la configuración antes de editar ofertas." />,
    );
  const warehouseId = locations.stock_locations[0].id;
  const hasActiveProfiles = profiles.shipping_profiles.some(
    (profile) => !isShippingProfileArchived(profile),
  );
  return (
    <div className="space-y-4">
      {!hasActiveProfiles ? (
        <p className="rounded-lg border p-3 text-sm">
          Configura tus envíos antes de empezar a vender este producto.{" "}
          <Link
            href="/seller/settings/shipping"
            className="font-medium underline"
          >
            Configurar mis envíos
          </Link>
        </p>
      ) : null}
      {product.variants.map((variant) => {
        const offer = offers.offers.find(
          (entry) => entry.variant_id === variant.id,
        );
        let amount = "";
        let error = "";
        try {
          const base = baseUsdPrice(offer?.prices ?? []);
          amount = base ? String(Number(base.amount)) : "";
        } catch (failure) {
          error =
            failure instanceof Error
              ? failure.message
              : "Precio no disponible.";
        }
        return (
          <PresentationCard
            key={variant.id}
            product={product}
            variant={variant}
            hasPending={hasPending}
            summary={
              error ? (
                <DataError message={error} />
              ) : (
                <dl className="flex flex-wrap gap-x-12 gap-y-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Precio</dt>
                    <dd className="mt-1 tabular-nums">
                      <PresentationEditValue>
                        {amount ? formatMoney(amount, "USD") : "Sin precio"}
                      </PresentationEditValue>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Envío</dt>
                    <dd className="mt-1">
                      <PresentationEditValue>
                        {(() => {
                          const profile = profiles.shipping_profiles.find(
                            (entry) => entry.id === offer?.shipping_profile_id,
                          );
                          return profile
                            ? `${shippingProfileName(profile)}${isShippingProfileArchived(profile) ? " (archivado)" : ""}`
                            : "Sin configurar";
                        })()}
                      </PresentationEditValue>
                    </dd>
                  </div>
                </dl>
              )
            }
            priceForm={
              !error && (offer || hasActiveProfiles) ? (
                <OfferForm
                  key={offer?.id ?? "new"}
                  defaultSku={
                    offer?.sku ||
                    createMasterSku(variant.title || product.title)
                  }
                  variantId={variant.id}
                  product={product}
                  variant={variant}
                  hasPending={hasPending}
                  masterSku={variant.sku || createMasterSku(variant.title)}
                  warehouseId={warehouseId}
                  profiles={profiles.shipping_profiles}
                  offer={
                    offer
                      ? {
                          id: offer.id,
                          sku: offer.sku,
                          amount,
                          shippingProfileId: offer.shipping_profile_id,
                        }
                      : undefined
                  }
                />
              ) : undefined
            }
            inventoryLink={
              offer ? (
                <Link
                  href={`/seller/inventory?q=${encodeURIComponent(product.title)}`}
                  className="inline-block text-sm text-primary underline underline-offset-4"
                >
                  Ajustar existencias en inventario
                </Link>
              ) : undefined
            }
          />
        );
      })}
    </div>
  );
}
