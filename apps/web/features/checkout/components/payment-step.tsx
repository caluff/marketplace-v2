"use client"

import type { HttpTypes } from "@medusajs/types"
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import { LockKeyhole } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  completeCheckoutAction,
  initializePaymentAction,
  type CartActionState,
} from "@/features/cart/actions"
import { formatMoney } from "@/features/cart/presentation"

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = publishableKey
  ? loadStripe(publishableKey).catch(() => null)
  : null
const ACCEPTED_PAYMENT_STATUSES = [
  "succeeded",
  "requires_capture",
  "processing",
]

export function PaymentStep({
  cart,
  providers,
}: {
  cart: HttpTypes.StoreCart
  providers: HttpTypes.StorePaymentProvider[]
}) {
  const availableProviders = providers.filter((provider) =>
    provider.id.startsWith("pp_stripe_"),
  )
  const [providerId, setProviderId] = useState(availableProviders[0]?.id ?? "")
  const [isStripeUnavailable, setIsStripeUnavailable] = useState(!stripePromise)
  useEffect(() => {
    let active = true
    void stripePromise?.then((stripe) => {
      if (active && !stripe) setIsStripeUnavailable(true)
    })
    return () => {
      active = false
    }
  }, [])
  const [state, action, pending] = useActionState(
    async (previous: CartActionState, formData: FormData) => {
      try {
        return await initializePaymentAction(previous, formData)
      } catch {
        return { error: "No pudimos preparar el pago. Inténtalo nuevamente." }
      }
    },
    {},
  )

  return (
    <section className="space-y-6" aria-labelledby="payment-title">
      <h2 id="payment-title" className="text-2xl font-medium tracking-tight">
        Revisar y pagar
      </h2>
      <div className="border border-border p-4 text-sm leading-relaxed">
        <p className="font-semibold">
          {cart.shipping_address?.first_name} {cart.shipping_address?.last_name}
        </p>
        <p>
          {cart.shipping_address?.address_1}
          {cart.shipping_address?.address_2
            ? `, ${cart.shipping_address.address_2}`
            : ""}
        </p>
        <p>
          {cart.shipping_address?.city},{" "}
          {cart.shipping_address?.province?.toUpperCase()}{" "}
          {cart.shipping_address?.postal_code}
        </p>
        <p>Estados Unidos</p>
        <p className="mt-2 text-muted-foreground">{cart.email}</p>
        <Link
          href="/checkout?step=address"
          className="mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Editar dirección
        </Link>
        <div className="mt-2 border-t border-border pt-3">
          {cart.shipping_methods?.map((method) => (
            <p key={method.id}>
              {method.name} · {formatMoney(method.amount, cart.currency_code)}
            </p>
          ))}
          <Link
            href="/checkout?step=shipping"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Editar envío
          </Link>
        </div>
      </div>
      {isStripeUnavailable || !availableProviders.length ? (
        <p
          role="status"
          className="border border-border bg-muted/30 p-5 text-sm"
        >
          El pago no está disponible en este momento. Tu carrito queda guardado
          para que puedas volver a intentarlo.
        </p>
      ) : state.clientSecret ? (
        <Elements
          key={state.clientSecret}
          stripe={stripePromise}
          options={{ clientSecret: state.clientSecret, locale: "es" }}
        >
          <StripePaymentForm cart={cart} clientSecret={state.clientSecret} />
        </Elements>
      ) : (
        <form action={action} className="space-y-5" aria-busy={pending}>
          <fieldset disabled={pending} className="space-y-3">
            <legend className="mb-3 text-sm font-semibold">
              Pago seguro con Stripe
            </legend>
            {availableProviders.map((provider, index) => (
              <label
                key={provider.id}
                className="flex min-h-14 cursor-pointer items-center gap-3 border border-border p-4 has-checked:border-foreground"
              >
                <input
                  type="radio"
                  name="provider_id"
                  value={provider.id}
                  checked={providerId === provider.id}
                  onChange={() => setProviderId(provider.id)}
                  required
                  className="size-4 accent-brand-accent"
                />
                <span className="text-sm font-medium">
                  {availableProviders.length > 1
                    ? `Stripe · opción ${index + 1}`
                    : "Stripe"}
                </span>
              </label>
            ))}
          </fieldset>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={pending || !providerId}
            className="w-full"
            size="lg"
          >
            {pending ? "Preparando pago…" : "Introducir datos de pago"}
          </Button>
        </form>
      )}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
        Los datos de pago se procesan de forma segura con Stripe.
      </p>
    </section>
  )
}

function StripePaymentForm({
  cart,
  clientSecret,
}: {
  cart: HttpTypes.StoreCart
  clientSecret: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [hasSubmittedPayment, setHasSubmittedPayment] = useState(false)
  const [message, setMessage] = useState<string>()
  const [verification, setVerification] = useState<
    "loading" | "ready" | "error"
  >("loading")
  const [verificationAttempt, setVerificationAttempt] = useState(0)

  useEffect(() => {
    if (!stripe) return
    let active = true

    async function verifyPayment() {
      try {
        const result = await stripe!.retrievePaymentIntent(clientSecret)
        if (!active) return
        if (result.error) {
          setMessage(
            result.error.message ?? "No pudimos consultar el estado del pago.",
          )
          setVerification("error")
          return
        }
        setHasSubmittedPayment(
          ACCEPTED_PAYMENT_STATUSES.includes(result.paymentIntent.status),
        )
        setVerification("ready")
      } catch {
        if (!active) return
        setMessage(
          "No pudimos consultar el estado del pago. Vuelve a intentarlo antes de pagar.",
        )
        setVerification("error")
      }
    }

    void verifyPayment()
    return () => {
      active = false
    }
  }, [stripe, clientSecret, verificationAttempt])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending || verification !== "ready") return
    if (!hasSubmittedPayment && (!stripe || !elements || !isReady)) return
    setIsPending(true)
    setMessage(undefined)

    try {
      if (!hasSubmittedPayment) {
        if (!stripe || !elements) return
        const current = await stripe.retrievePaymentIntent(clientSecret)
        if (current.error) {
          setMessage(
            current.error.message ??
              "No pudimos consultar el estado del pago. Inténtalo nuevamente.",
          )
          return
        }
        const result = ACCEPTED_PAYMENT_STATUSES.includes(
          current.paymentIntent.status,
        )
          ? current
          : await stripe.confirmPayment({
              elements,
              confirmParams: {
                return_url: `${window.location.origin}/checkout/return`,
              },
              redirect: "if_required",
            })
        if (result.error) {
          setMessage(
            result.error.message ??
              "No se pudo confirmar el pago. Revisa los datos e inténtalo nuevamente.",
          )
          return
        }
        if (!ACCEPTED_PAYMENT_STATUSES.includes(result.paymentIntent.status)) {
          setMessage(
            "El pago requiere atención. Revisa el método de pago e inténtalo nuevamente.",
          )
          return
        }
        setHasSubmittedPayment(true)
      }

      const result = await completeCheckoutAction()
      if (result.redirectTo) {
        router.replace(result.redirectTo)
      } else {
        setMessage(
          result.error ??
            "El pago está en proceso. Puedes consultar su estado nuevamente.",
        )
      }
    } catch {
      setMessage(
        "No pudimos comprobar el pedido. Vuelve a consultar el estado antes de intentar otro pago.",
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
      aria-busy={isPending || verification === "loading"}
    >
      {verification === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Consultando el estado del pago…
        </p>
      ) : verification === "ready" && !hasSubmittedPayment ? (
        <>
          {!isReady ? (
            <p role="status" className="text-sm text-muted-foreground">
              Cargando formulario de pago seguro…
            </p>
          ) : null}
          <PaymentElement
            onReady={() => setIsReady(true)}
            onLoadError={() =>
              setMessage(
                "No pudimos cargar el formulario de pago. Recarga la página para intentarlo nuevamente.",
              )
            }
          />
        </>
      ) : verification === "ready" ? (
        <p className="text-sm text-muted-foreground">
          Estamos verificando la confirmación del pago y la creación de tu
          pedido.
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      {verification === "error" ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setMessage(undefined)
            setVerification("loading")
            setVerificationAttempt((attempt) => attempt + 1)
          }}
        >
          Volver a consultar el pago
        </Button>
      ) : (
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={
            isPending ||
            verification !== "ready" ||
            (!hasSubmittedPayment && (!stripe || !elements || !isReady))
          }
        >
          {isPending
            ? "Procesando…"
            : hasSubmittedPayment
              ? "Consultar estado del pedido"
              : `Pagar ${formatMoney(cart.total, cart.currency_code)}`}
        </Button>
      )}
    </form>
  )
}
