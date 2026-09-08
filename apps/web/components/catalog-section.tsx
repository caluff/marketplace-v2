import type { HttpTypes } from "@medusajs/types"
import {
  CircleAlert,
  Clock,
  CloudOff,
  KeyRound,
  PackageOpen,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { ProductCard } from "@/components/product-card"
import { ProductGridSkeleton } from "@/components/product-grid-skeleton"
import { Skeleton } from "@/components/ui/skeleton"
import { FavoriteButton } from "@/features/account/components/favorite-button"
import { getFavoriteProductIds } from "@/features/account/favorites"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { StorefrontCatalogResult } from "@/lib/medusa"

type CatalogSectionProps = {
  categories: Promise<HttpTypes.StoreProductCategory[]>
  result: Promise<StorefrontCatalogResult>
  activeCategoryId: Promise<string | undefined>
  customer: Promise<HttpTypes.StoreCustomer | null>
}

type ErrorStatus = Exclude<
  StorefrontCatalogResult["status"],
  "products" | "empty"
>

const errorContent: Record<
  ErrorStatus,
  {
    title: string
    description: string
    Icon: typeof CircleAlert
  }
> = {
  configuration_missing: {
    title: "Falta completar la conexión",
    description:
      "El storefront necesita la dirección pública del backend y una clave publicable antes de mostrar el catálogo.",
    Icon: CircleAlert,
  },
  invalid_backend_url: {
    title: "La dirección del catálogo no es válida",
    description:
      "La URL pública debe usar HTTP o HTTPS y no puede incluir credenciales, parámetros ni fragmentos.",
    Icon: ShieldAlert,
  },
  invalid_publishable_key: {
    title: "La clave pública no tiene el formato esperado",
    description:
      "Configurá una clave publicable de Medusa que comience con pk_. Su valor nunca se muestra en esta página.",
    Icon: KeyRound,
  },
  backend_unavailable: {
    title: "El catálogo está fuera de línea",
    description:
      "El servicio rechazó la conexión. Puede estar detenido o todavía iniciándose.",
    Icon: CloudOff,
  },
  request_timeout: {
    title: "El catálogo está demorando demasiado",
    description:
      "La consulta superó el tiempo de espera. Probá otra vez en unos instantes.",
    Icon: Clock,
  },
  network_error: {
    title: "No pudimos llegar al catálogo",
    description:
      "Hubo un problema de red o de resolución de la dirección del servicio.",
    Icon: WifiOff,
  },
  key_rejected: {
    title: "La clave pública fue rechazada",
    description:
      "Medusa no autorizó esta consulta. Revisá que la clave publicable corresponda al Store API configurado.",
    Icon: KeyRound,
  },
  store_api_error: {
    title: "El catálogo respondió con un error",
    description:
      "La conexión funciona, pero el Store API no pudo completar la consulta de productos.",
    Icon: CircleAlert,
  },
}

function RetryButton({ activeCategoryId }: { activeCategoryId?: string }) {
  return (
    <form action="/" method="get">
      {activeCategoryId ? (
        <input type="hidden" name="category_id" value={activeCategoryId} />
      ) : null}
      <Button type="submit" variant="outline">
        <RefreshCw aria-hidden="true" className="size-4" />
        Reintentar
      </Button>
    </form>
  )
}

export function CatalogSection(props: CatalogSectionProps) {
  return (
    <section
      id="catalog"
      aria-labelledby="catalog-title"
      className="scroll-mt-24 border-b border-border"
    >
      <div className="mx-auto w-full max-w-[90rem] px-4 py-14 sm:px-6 sm:py-20 lg:px-10 lg:py-24">
        <div className="mb-10 grid gap-5 border-b border-foreground pb-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="font-sans text-xs font-bold tracking-[0.16em] text-brand-accent uppercase">
              Edición actual
            </p>
            <h2
              id="catalog-title"
              className="mt-2 text-4xl tracking-[-0.035em] sm:text-6xl"
            >
              <Suspense fallback="El catálogo">
                <CatalogTitle
                  categories={props.categories}
                  activeCategoryId={props.activeCategoryId}
                />
              </Suspense>
            </h2>
          </div>
          <Suspense fallback={null}>
            <CatalogCount result={props.result} />
          </Suspense>
        </div>
        <Suspense fallback={<ProductGridSkeleton />}>
          <CatalogContent {...props} />
        </Suspense>
      </div>
    </section>
  )
}

async function CatalogTitle({
  categories,
  activeCategoryId,
}: Pick<CatalogSectionProps, "categories" | "activeCategoryId">) {
  const categoryId = await activeCategoryId
  if (!categoryId) return "El catálogo"
  return (
    (await categories).find((category) => category.id === categoryId)?.name ??
    "El catálogo"
  )
}

async function CatalogCount({ result }: Pick<CatalogSectionProps, "result">) {
  const catalog = await result
  return catalog.status === "products" ? (
    <p className="font-sans text-sm text-muted-foreground">
      Mostrando {catalog.products.length} de {catalog.count}
    </p>
  ) : null
}

async function ProductFavorite({
  customer,
  productId,
}: Pick<CatalogSectionProps, "customer"> & { productId: string }) {
  const account = await customer
  return (
    <FavoriteButton
      productId={productId}
      saved={getFavoriteProductIds(account?.metadata).includes(productId)}
      authenticated={Boolean(account)}
      compact
    />
  )
}

async function CatalogContent(props: CatalogSectionProps) {
  const [result, activeCategoryId] = await Promise.all([
    props.result,
    props.activeCategoryId,
  ])
  const activeCategory = Boolean(activeCategoryId)
  return (
    <>
      {result.status === "products" ? (
        <>
          {activeCategory ? (
            <div className="mb-7 flex justify-end">
              <Button asChild variant="ghost" size="sm">
                <Link href="/#catalog">Quitar filtro</Link>
              </Button>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {result.products.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                index={index}
                favoriteAction={
                  <Suspense
                    fallback={
                      <Skeleton
                        className="size-11"
                        aria-label="Cargando favorito"
                      />
                    }
                  >
                    <ProductFavorite
                      customer={props.customer}
                      productId={product.id}
                    />
                  </Suspense>
                }
              />
            ))}
          </div>
        </>
      ) : null}

      {result.status === "empty" ? (
        <Card className="mx-auto max-w-2xl bg-background text-center">
          <CardHeader className="items-center px-6 py-12 sm:px-12 sm:py-16">
            <PackageOpen
              aria-hidden="true"
              className="size-12 text-brand-accent"
              strokeWidth={1.25}
            />
            <CardTitle className="mt-3 text-3xl">
              {activeCategory
                ? "Esta categoría todavía está vacía"
                : "El catálogo todavía está vacío"}
            </CardTitle>
            <CardDescription className="max-w-md text-base">
              {activeCategory
                ? "Volvé al catálogo completo para seguir explorando."
                : "La conexión está lista. Los productos aparecerán acá cuando se publiquen en Medusa."}
            </CardDescription>
            {activeCategory ? (
              <Button asChild variant="accent" className="mt-4">
                <Link href="/#catalog">Ver todo el catálogo</Link>
              </Button>
            ) : null}
          </CardHeader>
        </Card>
      ) : null}

      {result.status !== "products" && result.status !== "empty" ? (
        <Card className="mx-auto max-w-2xl bg-background">
          <CardHeader className="px-6 py-10 sm:px-10 sm:py-12">
            {(() => {
              const content = errorContent[result.status]
              const Icon = content.Icon

              return (
                <>
                  <Icon
                    aria-hidden="true"
                    className="size-11 text-brand-accent"
                    strokeWidth={1.25}
                  />
                  <CardTitle className="mt-3 text-3xl">
                    {content.title}
                  </CardTitle>
                  <CardDescription className="max-w-xl text-base">
                    {content.description}
                  </CardDescription>
                  <div className="mt-5">
                    <RetryButton activeCategoryId={activeCategoryId} />
                  </div>
                </>
              )
            })()}
          </CardHeader>
        </Card>
      ) : null}
    </>
  )
}
