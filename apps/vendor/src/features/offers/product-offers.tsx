import type { ProductDTO } from "@mercurjs/types";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataError } from "../workspace/components";
import { resultOf, workspace } from "../workspace/data";
import { baseUsdPrice, OFFER_FIELDS, type OfferWithPrices } from "./operations";
import { OfferForm } from "./offer-form";
import type { offerConfiguration } from "./data";
import { createMasterSku } from "../catalog/master-sku";

export async function ProductOffers({
  product,
  configuration,
}: {
  product: ProductDTO;
  configuration: ReturnType<
    typeof resultOf<Awaited<ReturnType<typeof offerConfiguration>>>
  >;
}) {
  if (product.status !== "published")
    return (
      <p className="text-sm text-muted-foreground">
        Podrás configurar precios cuando el producto esté publicado y aprobado
        para tu tienda.
      </p>
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
  if (!result.data) return <DataError message={result.error} />;
  const [offers, configured] = result.data;
  if (!configured.data) return <DataError message={configured.error} />;
  const [locations, profiles] = configured.data;
  if (locations.count !== 1 || locations.stock_locations.length !== 1)
    return (
      <p className="text-sm text-muted-foreground">
        Tu tienda necesita un almacén único validado.{" "}
        <Link href="/seller/inventory/locations" className="underline">
          Revisar almacén
        </Link>
      </p>
    );
  if (offers.count > offers.offers.length)
    return (
      <DataError message="Hay más ofertas de las que se pudieron cargar. El operador debe revisar el catálogo antes de editar precios." />
    );
  if (profiles.count > profiles.shipping_profiles.length)
    return (
      <DataError message="No se pudieron cargar todos los perfiles de envío. Revisa la configuración antes de editar ofertas." />
    );
  const warehouseId = locations.stock_locations[0].id;
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        Guardar los precios no activa las ventas. Tu tienda también debe tener
        los envíos y los cobros configurados.
      </p>
      {!profiles.shipping_profiles.length ? (
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
          <Card key={variant.id}>
            <CardHeader>
              <CardTitle>{variant.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                <DataError message={error} />
              ) : offer || profiles.shipping_profiles.length ? (
                <OfferForm
                  defaultSku={
                    offer?.sku ||
                    createMasterSku(variant.title || product.title)
                  }
                  variantId={variant.id}
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  Configura los envíos para añadir un precio a esta
                  presentación.
                </p>
              )}
              {offer ? (
                <Link
                  href="/seller/inventory"
                  className="mt-4 inline-block text-sm text-primary underline"
                >
                  Ajustar existencias en inventario
                </Link>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
