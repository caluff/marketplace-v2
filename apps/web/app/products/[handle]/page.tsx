import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductGallery } from "@/features/catalog/product-gallery"
import { ProductOffers } from "@/features/catalog/product-offers"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import {
  getStorefrontCategories,
  getStorefrontProduct,
  getStorefrontRegion,
} from "@/lib/medusa"

export const dynamic = "force-dynamic"

type ProductPageProps = { params: Promise<{ handle: string }> }

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { handle } = await params
  try {
    const { product } = await getStorefrontProduct(handle)
    return product
      ? {
          title: product.title,
          description: product.description?.slice(0, 160) ?? undefined,
        }
      : { title: "Producto no encontrado" }
  } catch {
    return { title: "Producto" }
  }
}

function ProductSkeleton() {
  return (
    <div
      aria-label="Cargando producto"
      className="grid gap-8 md:grid-cols-[1.1fr_1fr] lg:gap-16"
    >
      <Skeleton className="aspect-[4/5] w-full" />
      <div className="space-y-6 py-4">
        <Skeleton className="h-14 w-4/5" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}

async function ProductContent({
  params,
  regionPromise,
}: ProductPageProps & {
  regionPromise: ReturnType<typeof getStorefrontRegion>
}) {
  const { handle } = await params
  let result: Awaited<ReturnType<typeof getStorefrontProduct>>
  try {
    result = await getStorefrontProduct(handle)
  } catch {
    return (
      <div role="alert" className="border border-border p-8">
        <h1 className="text-3xl">No pudimos cargar este producto</h1>
        <p className="mt-4 font-sans text-muted-foreground">
          Vuelve a intentar en unos instantes.
        </p>
        <Link
          href={`/products/${encodeURIComponent(handle)}`}
          className="mt-6 inline-flex min-h-11 items-center font-sans underline underline-offset-4"
        >
          Reintentar
        </Link>
      </div>
    )
  }
  const { product } = result
  if (!product) notFound()
  const images = [
    ...new Set(
      [
        product.thumbnail,
        ...(product.images?.map((image) => image.url) ?? []),
      ].filter((image): image is string => Boolean(image)),
    ),
  ]
  return (
    <>
      <article className="grid items-start gap-8 md:grid-cols-[1.1fr_1fr] lg:gap-16">
        <ProductGallery title={product.title} sources={images} />
        <div className="md:sticky md:top-28">
          {product.categories?.[0] ? (
            <Link
              href={`/?category_id=${encodeURIComponent(product.categories[0].id)}#catalog`}
              className="font-sans text-xs font-bold tracking-[0.14em] text-brand-accent uppercase"
            >
              {product.categories[0].name}
            </Link>
          ) : null}
          <h1 className="mt-3 text-4xl tracking-[-0.035em] sm:text-5xl lg:text-6xl">
            {product.title}
          </h1>
          {product.subtitle ? (
            <p className="mt-5 font-sans text-lg text-muted-foreground">
              {product.subtitle}
            </p>
          ) : null}
          {product.description ? (
            <p className="mt-6 whitespace-pre-line font-sans text-sm leading-7 text-muted-foreground">
              {product.description}
            </p>
          ) : null}
          <Suspense
            fallback={
              <div
                aria-label="Cargando precio y disponibilidad"
                className="mt-8 space-y-6"
              >
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            }
          >
            <ProductOffers product={product} regionPromise={regionPromise} />
          </Suspense>
        </div>
      </article>
    </>
  )
}

export default function ProductPage(props: ProductPageProps) {
  const categories = getStorefrontCategories()
  const customer = getCurrentCustomer()
  const regionPromise = getStorefrontRegion()
  // ProductOffers reports this error locally, once the product has rendered.
  void regionPromise.catch(() => undefined)
  return (
    <>
      <SiteHeader categories={categories} customer={customer} />
      <main className="mx-auto w-full max-w-[90rem] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <nav aria-label="Ruta de navegación" className="mb-8">
          <Link
            href="/#catalog"
            className="inline-flex min-h-11 items-center gap-2 font-sans text-sm font-semibold hover:text-brand-accent"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver al catálogo
          </Link>
        </nav>
        <Suspense fallback={<ProductSkeleton />}>
          <ProductContent {...props} regionPromise={regionPromise} />
        </Suspense>
      </main>
      <SiteFooter categories={categories} />
    </>
  )
}
