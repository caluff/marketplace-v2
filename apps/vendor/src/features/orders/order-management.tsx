import type { OrderDetailDTO } from "@medusajs/types";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataError } from "../workspace/components";
import { resultOf, workspace } from "../workspace/data";
import { formatDate } from "../workspace/presentation";
import { sellerWarehouse } from "../inventory/data";
import {
  orderCapabilities,
  preparationIssue,
  remainingToPrepare,
} from "./operations";
import { OrderActionForm } from "./order-action-form";

async function PreparationForm({ order }: { order: OrderDetailDTO }) {
  const { client } = await workspace();
  const result = await resultOf(
    sellerWarehouse(client).catch((error: unknown) => {
      if (error instanceof TypeError)
        throw new Error(
          "No se pudo verificar el almacén aprobado. Actualiza la página; si el problema continúa, contacta al operador.",
        );
      throw error;
    }),
  );
  if (!result.data)
    return (
      <DataError
        message={`${result.error} Actualiza la página para volver a intentarlo.`}
      />
    );
  if (result.data.status !== "ready")
    return (
      <p className="text-sm text-muted-foreground">
        No se pudo verificar el almacén aprobado.{" "}
        <Link href="/seller/inventory/locations" className="underline">
          Revisa tu almacén
        </Link>{" "}
        o contacta al operador para poder preparar el pedido.
      </p>
    );
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Almacén: {result.data.location.name}
      </p>
      {[true, false].map((requiresShipping) => {
        const items = (order.items ?? []).filter(
          (item) =>
            item.requires_shipping === requiresShipping &&
            (remainingToPrepare(item) ?? 0) > 0,
        );
        if (!items.length) return null;
        return (
          <OrderActionForm
            key={String(requiresShipping)}
            orderId={order.id}
            action="prepare"
            label={
              requiresShipping ? "Preparar para envío" : "Preparar sin envío"
            }
          >
            <p className="text-sm">
              Se prepararán todas las unidades pendientes de estos artículos.
            </p>
            <ul className="space-y-1 text-sm">
              {items.map((item) => (
                <li key={item.id}>
                  {item.title} · {remainingToPrepare(item)} pendientes
                </li>
              ))}
            </ul>
            <details className="text-sm">
              <summary className="cursor-pointer py-2 text-muted-foreground">
                Preparar solo una parte (opcional)
              </summary>
              <div className="space-y-4 pt-3">
                {items.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <label htmlFor={`quantity-${item.id}`} className="text-sm">
                      {item.title}
                      <span className="block text-xs text-muted-foreground">
                        {remainingToPrepare(item)} pendientes
                      </span>
                    </label>
                    <Input
                      id={`quantity-${item.id}`}
                      name={`quantity:${item.id}`}
                      type="number"
                      min={0}
                      max={remainingToPrepare(item) ?? 0}
                      step={1}
                      defaultValue={remainingToPrepare(item) ?? 0}
                      required
                      className="h-11"
                    />
                  </div>
                ))}
              </div>
            </details>
          </OrderActionForm>
        );
      })}
    </div>
  );
}

function safeTrackingHref(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function OrderManagement({ order }: { order: OrderDetailDTO }) {
  const capabilities = orderCapabilities(order);
  return (
    <>
      {order.status === "pending" ? (
        <Card>
          <CardHeader>
            <CardTitle>Preparar artículos</CardTitle>
          </CardHeader>
          <CardContent>
            {capabilities.prepare ? (
              <Suspense
                fallback={
                  <Skeleton
                    className="h-40 w-full"
                    aria-label="Cargando almacén aprobado"
                  />
                }
              >
                <PreparationForm key={String(order.updated_at)} order={order} />
              </Suspense>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                {preparationIssue(order)}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Preparaciones y envíos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {order.fulfillments?.length ? (
            order.fulfillments.map((fulfillment, index) => (
              <section
                key={`${fulfillment.id}:${fulfillment.shipped_at}:${fulfillment.delivered_at}:${fulfillment.canceled_at}`}
                className="space-y-3 border-b pb-5 last:border-0 last:pb-0"
              >
                <h3 className="text-sm font-semibold">
                  Preparación {index + 1} ·{" "}
                  {fulfillment.canceled_at
                    ? "Cancelada"
                    : fulfillment.delivered_at
                      ? "Entregada"
                      : fulfillment.shipped_at
                        ? "Enviada"
                        : "Preparada"}
                </h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {[
                    ...new Map(
                      fulfillment.items?.map((item) => [
                        item.line_item_id ?? item.id,
                        order.items?.find(
                          (line) => line.id === item.line_item_id,
                        )?.title ?? item.title,
                      ]),
                    ).entries(),
                  ].map(([id, title]) => (
                    <li key={id}>{title}</li>
                  ))}
                </ul>
                {fulfillment.shipped_at ? (
                  <p className="text-xs text-muted-foreground">
                    Enviado el {formatDate(fulfillment.shipped_at)}
                  </p>
                ) : null}
                {fulfillment.delivered_at ? (
                  <p className="text-xs text-muted-foreground">
                    Entregado el {formatDate(fulfillment.delivered_at)}
                  </p>
                ) : null}
                {fulfillment.labels?.map((label) => (
                  <p key={label.id} className="break-all text-sm">
                    Seguimiento:{" "}
                    {safeTrackingHref(label.tracking_url) ? (
                      <a
                        href={safeTrackingHref(label.tracking_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary underline"
                      >
                        {label.tracking_number}
                      </a>
                    ) : (
                      label.tracking_number
                    )}
                  </p>
                ))}
                {order.status === "pending" &&
                !fulfillment.canceled_at &&
                !fulfillment.delivered_at ? (
                  fulfillment.shipped_at ? (
                    <OrderActionForm
                      orderId={order.id}
                      fulfillmentId={fulfillment.id}
                      action="deliver"
                      label="Marcar como entregado"
                      confirmation="Confirmo que el cliente recibió estos artículos."
                    />
                  ) : (
                    <>
                      <OrderActionForm
                        orderId={order.id}
                        fulfillmentId={fulfillment.id}
                        action="ship"
                        label="Registrar envío"
                      >
                        <div className="space-y-2">
                          <label
                            htmlFor={`tracking-${fulfillment.id}`}
                            className="text-sm"
                          >
                            Número de seguimiento (opcional)
                          </label>
                          <Input
                            id={`tracking-${fulfillment.id}`}
                            name="tracking_number"
                            maxLength={200}
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <label
                            htmlFor={`tracking-url-${fulfillment.id}`}
                            className="text-sm"
                          >
                            Enlace de seguimiento (opcional)
                          </label>
                          <Input
                            id={`tracking-url-${fulfillment.id}`}
                            name="tracking_url"
                            type="url"
                            maxLength={2000}
                            placeholder="https://"
                            className="h-11"
                          />
                        </div>
                      </OrderActionForm>
                      <details className="text-sm">
                        <summary className="cursor-pointer py-2 text-muted-foreground">
                          Cancelar esta preparación
                        </summary>
                        <div className="pt-3">
                          <OrderActionForm
                            orderId={order.id}
                            fulfillmentId={fulfillment.id}
                            action="cancel_fulfillment"
                            label="Cancelar preparación"
                            confirmation="Confirmo que estos artículos todavía no fueron enviados."
                            destructive
                          />
                        </div>
                      </details>
                    </>
                  )
                ) : null}
              </section>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin preparaciones registradas.
              {order.status !== "pending"
                ? ` ${preparationIssue(order)}`
                : null}
            </p>
          )}
        </CardContent>
      </Card>
      {capabilities.complete ? (
        <Card>
          <CardHeader>
            <CardTitle>Gestionar pedido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {capabilities.complete ? (
              <OrderActionForm
                orderId={order.id}
                action="complete"
                label="Completar pedido"
                confirmation="Confirmo que la gestión de este pedido terminó."
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
