import { Check, ExternalLink, Package, Truck } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { AccountOrder } from "../order-data"
import { formatOrderDate, getShippingStatusLabel } from "../order-format"
import { getOrderProgress, safeTrackingUrl } from "../order-progress"

export function OrderTracking({ order }: { order: AccountOrder }) {
  const canceled = order.status === "canceled"
  const steps = getOrderProgress(order)
  const currentStep =
    order.fulfillment_status === "canceled"
      ? -1
      : steps.findIndex((step) => !step.complete)
  return (
    <section className="space-y-6" aria-label="Seguimiento del pedido">
      <div className="grid gap-4 rounded-lg bg-muted/60 p-4 sm:grid-cols-2">
        <div className="flex items-start gap-3">
          <Truck
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <h3 className="text-xs font-semibold">Envío y entrega</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {order.shipping_methods?.length
                ? order.shipping_methods
                    .map((method) => method.name)
                    .join(" · ")
                : "Método de envío no disponible"}
            </p>
            {order.fulfillments?.map((fulfillment, shipmentIndex) => (
              <div key={fulfillment.id}>
                {!fulfillment.canceled_at
                  ? fulfillment.labels?.map((label, index) => {
                      const href = safeTrackingUrl(label.tracking_url)
                      return (
                        <div
                          key={`${label.tracking_number}-${index}`}
                          className="break-all text-xs"
                        >
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                            >
                              Rastrear pedido
                              {order.fulfillments!.length > 1
                                ? ` · Envío ${shipmentIndex + 1}`
                                : ""}
                              {fulfillment.labels!.length > 1
                                ? ` · ${label.tracking_number || index + 1}`
                                : ""}
                              <ExternalLink
                                className="size-3 shrink-0"
                                aria-hidden="true"
                              />
                            </a>
                          ) : label.tracking_number ? (
                            <p>Seguimiento: {label.tracking_number}</p>
                          ) : null}
                        </div>
                      )
                    })
                  : null}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-start gap-3 border-t border-border pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
          <Package
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <span>
              <span className="block text-xs font-semibold">
                Estado del envío
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {canceled
                  ? "Pedido cancelado"
                  : order.fulfillment_status === "canceled"
                    ? "Preparaciones canceladas"
                    : getShippingStatusLabel(order.fulfillment_status)}
              </span>
            </span>
            <Dialog>
              <DialogTrigger className="inline-flex min-h-11 items-center text-xs font-semibold text-brand-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">
                Ver detalle
              </DialogTrigger>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>Detalle del envío</DialogTitle>
                </DialogHeader>
                <OrderShipmentHistory order={order} />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
      <div>
        {!canceled ? (
          <ol className="grid sm:grid-cols-4">
            {steps.map((step, index) => (
              <li
                key={step.label}
                aria-current={index === currentStep ? "step" : undefined}
                className="relative flex gap-4 pb-6 last:pb-0 sm:block sm:pb-0 sm:text-center"
              >
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`absolute top-8 bottom-0 left-4 w-px sm:top-4 sm:left-1/2 sm:h-px sm:w-full ${steps[index + 1].complete ? "bg-success" : "bg-border"}`}
                  />
                ) : null}
                <span
                  className={`relative grid size-8 shrink-0 place-items-center rounded-full border sm:mx-auto sm:mb-3 ${step.complete ? "border-success bg-success text-white" : index === currentStep ? "border-foreground bg-card text-foreground ring-4 ring-muted" : "border-border bg-card text-muted-foreground"}`}
                >
                  {step.complete ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <span className="text-xs" aria-hidden="true">
                      {index + 1}
                    </span>
                  )}
                </span>
                <div className="pt-0.5 sm:px-1 sm:pt-0">
                  <p
                    className={`text-xs font-semibold ${!step.complete && index !== currentStep ? "text-muted-foreground" : ""}`}
                  >
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {step.complete
                      ? "Completado"
                      : index === currentStep
                        ? "Próximo paso"
                        : "Pendiente"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  )
}

export function OrderShipmentHistory({ order }: { order: AccountOrder }) {
  return (
    <div className="space-y-6">
      {order.fulfillments?.length ? (
        order.fulfillments.map((fulfillment, index) => (
          <div key={fulfillment.id}>
            <p className="text-sm font-semibold">
              Envío {index + 1}
              {fulfillment.canceled_at ? " · Cancelado" : ""}
            </p>
            {fulfillment.items?.length ? (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {Array.from(
                  new Set(fulfillment.items.map((item) => item.line_item_id)),
                ).map((lineItemId) => {
                  const product = order.items?.find(
                    (line) => line.id === lineItemId,
                  )
                  return product ? (
                    <li key={lineItemId}>{product.title}</li>
                  ) : null
                })}
              </ul>
            ) : null}
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ["Preparado", fulfillment.packed_at ?? fulfillment.created_at],
                ["Enviado", fulfillment.shipped_at],
                ["Entregado", fulfillment.delivered_at],
                ["Cancelado", fulfillment.canceled_at],
              ].map(([label, date]) =>
                date ? (
                  <div
                    key={String(label)}
                    className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:gap-4"
                  >
                    <dt className="text-muted-foreground">{String(label)}</dt>
                    <dd>{formatOrderDate(date)}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </div>
        ))
      ) : (
        <p className="text-xs text-muted-foreground">
          Aún no hay movimientos del envío.
        </p>
      )}
    </div>
  )
}
