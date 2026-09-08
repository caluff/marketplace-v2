import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { OrderSummary } from "@/features/cart/components/order-summary"
import {
  getCheckoutCart,
  getPaymentProviders,
  getShippingOptions,
} from "@/features/cart/data"
import { AddressStep } from "@/features/checkout/components/address-step"
import { PaymentStep } from "@/features/checkout/components/payment-step"
import { PaymentReturn } from "@/features/checkout/components/payment-return"
import { RetryCheckout } from "@/features/checkout/components/retry-checkout"
import { ShippingStep } from "@/features/checkout/components/shipping-step"

type CheckoutPageProps = {
  searchParams: Promise<{ step?: string | string[] }>
}

export default function CheckoutPage({ searchParams }: CheckoutPageProps) {
  return (
    <>
      <Link
        href="/cart"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al carrito
      </Link>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-7">
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
          Finalizar compra
        </h1>
        <p className="text-xs font-semibold tracking-wider uppercase">
          Estados Unidos · USD
        </p>
      </div>
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function CheckoutContent({ searchParams }: CheckoutPageProps) {
  const [cart, parameters] = await Promise.all([
    getCheckoutCart(),
    searchParams,
  ])
  if (cart?.completed_at) {
    return (
      <section aria-labelledby="checkout-recovery-title">
        <h2
          id="checkout-recovery-title"
          className="text-2xl font-medium tracking-tight"
        >
          Consultando tu pedido
        </h2>
        <PaymentReturn />
      </section>
    )
  }
  if (!cart?.items?.length) {
    return (
      <div className="py-14 text-center">
        <h2 className="text-2xl font-medium">Tu carrito está vacío</h2>
        <Button asChild className="mt-6">
          <Link href="/#catalog">Explorar el catálogo</Link>
        </Button>
      </div>
    )
  }

  const hasAddress = Boolean(
    cart.email &&
    cart.shipping_address?.address_1 &&
    cart.shipping_address.country_code === "us",
  )
  const hasShipping = hasAddress && Boolean(cart.shipping_methods?.length)
  const requestedStep =
    typeof parameters.step === "string" ? parameters.step : undefined
  const step =
    requestedStep === "address" || !hasAddress
      ? "address"
      : requestedStep === "shipping" || !hasShipping
        ? "shipping"
        : "payment"
  const steps = [
    { key: "address", title: "Dirección", enabled: true },
    { key: "shipping", title: "Envío", enabled: hasAddress },
    { key: "payment", title: "Pago", enabled: hasShipping },
  ]

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
      <div className="min-w-0">
        <nav aria-label="Pasos de compra" className="mb-9">
          <ol className="grid grid-cols-3 border-b border-border">
            {steps.map((item, index) => (
              <li key={item.key}>
                {item.enabled ? (
                  <Link
                    href={`/checkout?step=${item.key}`}
                    aria-current={step === item.key ? "step" : undefined}
                    className={`flex min-h-12 items-center gap-2 border-b-2 px-2 text-sm ${step === item.key ? "border-foreground font-semibold" : "border-transparent text-muted-foreground"}`}
                  >
                    <span className="text-xs">0{index + 1}</span>
                    {item.title}
                  </Link>
                ) : (
                  <span className="flex min-h-12 items-center gap-2 px-2 text-sm text-muted-foreground">
                    <span className="text-xs">0{index + 1}</span>
                    {item.title}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {step === "address" ? <AddressStep key={cart.id} cart={cart} /> : null}
        {step === "shipping" ? (
          <Suspense
            fallback={<StepSkeleton label="Cargando opciones de envío" />}
          >
            <ShippingContent cart={cart} />
          </Suspense>
        ) : null}
        {step === "payment" ? (
          <Suspense
            fallback={<StepSkeleton label="Cargando métodos de pago" />}
          >
            <PaymentContent cart={cart} />
          </Suspense>
        ) : null}
      </div>
      <aside className="lg:sticky lg:top-24">
        <OrderSummary cart={cart} />
      </aside>
    </div>
  )
}

async function ShippingContent({
  cart,
}: {
  cart: NonNullable<Awaited<ReturnType<typeof getCheckoutCart>>>
}) {
  let options: Awaited<ReturnType<typeof getShippingOptions>>
  try {
    options = await getShippingOptions(cart.id)
  } catch {
    return <LoadError message="No pudimos cargar los envíos disponibles." />
  }
  return (
    <ShippingStep
      key={JSON.stringify(cart.shipping_address)}
      cart={cart}
      options={options}
    />
  )
}

async function PaymentContent({
  cart,
}: {
  cart: NonNullable<Awaited<ReturnType<typeof getCheckoutCart>>>
}) {
  let providers: Awaited<ReturnType<typeof getPaymentProviders>>
  try {
    providers = cart.region_id ? await getPaymentProviders(cart.region_id) : []
  } catch {
    return <LoadError message="No pudimos cargar los métodos de pago." />
  }
  return (
    <PaymentStep
      key={`${cart.id}_${cart.total}_${cart.shipping_methods?.map((method) => method.id).join("_")}`}
      cart={cart}
      providers={providers}
    />
  )
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="border border-border p-6">
      <p role="alert" className="mb-4 text-sm">
        {message}
      </p>
      <RetryCheckout />
    </div>
  )
}

function StepSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <StepSkeleton label="Cargando tu compra" />
      <Skeleton className="h-80 w-full" />
    </div>
  )
}
