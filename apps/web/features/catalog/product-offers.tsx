import type { HttpTypes } from "@medusajs/types"
import { ProductPurchase } from "@/features/catalog/product-purchase"
import {
  getOfferPrice,
  isOfferAvailable,
  type StorefrontOffer,
} from "@/features/catalog/offers"
import { getStorefrontOffers, getStorefrontRegion } from "@/lib/medusa"

export async function ProductOffers({
  product,
  regionPromise,
}: {
  product: HttpTypes.StoreProduct
  regionPromise: ReturnType<typeof getStorefrontRegion>
}) {
  let offers: StorefrontOffer[]
  let region: HttpTypes.StoreRegion | null
  try {
    region = await regionPromise
    offers = region ? await getStorefrontOffers([product.id], region.id) : []
  } catch {
    return (
      <p
        role="alert"
        className="mt-8 border border-border bg-muted p-5 font-sans text-sm"
      >
        No pudimos consultar el precio y la disponibilidad. Actualiza la página
        para reintentar.
      </p>
    )
  }
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    image: product.images?.map((image) => image.url),
    offers: offers.flatMap((offer) => {
      const price = getOfferPrice(offer)
      return price
        ? [
            {
              "@type": "Offer",
              price: price.amount,
              priceCurrency: "USD",
              availability: isOfferAvailable(offer)
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
              seller: { "@type": "Organization", name: offer.seller?.name },
              eligibleRegion: { "@type": "Country", name: "US" },
            },
          ]
        : []
    }),
  }
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <ProductPurchase
        variants={product.variants ?? []}
        offers={offers}
        hasRegion={Boolean(region)}
      />
    </>
  )
}
