import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import { validateAndTransformBody } from "@medusajs/framework/http";
import type { ILockingModule } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  PolicyOperation,
} from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../modules/commerce-automation";
import type CommerceAutomationService from "../modules/commerce-automation/service";
import { orderFinanceInputSchema } from "../lib/order-finance/contracts";
import { z } from "@medusajs/framework/zod";
import { guardOrderFinanceWriterWorkflow } from "../workflows/guard-order-finance-writer";

export async function guardOrderFinanceWriters(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  let route: string;
  try {
    const rawPath = req.originalUrl.split("?")[0];
    if (/%2f|%5c/i.test(rawPath)) throw new Error("Encoded path separator");
    route = rawPath
      .split("/")
      .map((part, index) => {
        const decoded = decodeURIComponent(part);
        return index === 1 || index === 2 || index === 4
          ? decoded.toLowerCase()
          : decoded;
      })
      .join("/")
      .replace(/\/$/, "");
  } catch {
    next(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "La ruta de la operación no es válida.",
      ),
    );
    return;
  }
  const orderMatch = route.match(
    /^\/(?:admin|vendor)\/orders\/([^/]+)(?:\/.*)?$/,
  );
  const paymentMatch = route.match(
    /^\/(?:admin|vendor)\/payments\/([^/]+)\/(capture|refund)$/,
  );
  const collectionMatch = route.match(
    /^\/(?:admin|vendor)\/payment-collections\/([^/]+)(?:\/.*)?$/,
  );
  const changeMatch = route.match(
    /^\/(?:admin|vendor)\/(returns|claims|exchanges)(?:\/([^/]+))?(?:\/.*)?$/,
  );
  if (
    (!orderMatch && !paymentMatch && !collectionMatch && !changeMatch) ||
    route.endsWith("/finance")
  )
    return next();
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    let changeOrderId: string | undefined;
    if (changeMatch) {
      if (changeMatch[2]) {
        const entity = {
          returns: "return",
          claims: "order_claim",
          exchanges: "order_exchange",
        }[changeMatch[1]]!;
        const { data } = await query.graph(
          { entity, fields: ["order_id"], filters: { id: changeMatch[2] } },
          { cache: { enable: false } },
        );
        changeOrderId = z
          .object({ order_id: z.string() })
          .parse(data[0]).order_id;
      } else {
        const parsed = z.object({ order_id: z.string() }).safeParse(req.body);
        if (!parsed.success) return next();
        changeOrderId = parsed.data.order_id;
      }
    }
    const orderId = orderMatch?.[1] ?? changeOrderId;
    const { data: carts } = orderId
      ? await query.graph(
          {
            entity: "order_cart",
            fields: ["cart_id"],
            filters: { order_id: orderId },
          },
          { cache: { enable: false } },
        )
      : collectionMatch
        ? await query.graph(
            {
              entity: "payment_collection",
              fields: ["cart.id"],
              filters: { id: collectionMatch[1] },
            },
            { cache: { enable: false } },
          )
        : await query.graph(
            {
              entity: "payment",
              fields: ["payment_collection.cart.id"],
              filters: { id: paymentMatch![1] },
            },
            { cache: { enable: false } },
          );
    const candidate = carts[0] as
      | {
          cart_id?: string;
          cart?: { id?: string };
          payment_collection?: { cart?: { id?: string } };
        }
      | undefined;
    const cartId =
      candidate?.cart_id ??
      candidate?.cart?.id ??
      candidate?.payment_collection?.cart?.id;
    if (!cartId) return next();
    const { data: groups } = await query.graph(
      {
        entity: "order_group",
        fields: ["id", "orders.status"],
        filters: { cart_id: cartId },
      },
      { cache: { enable: false } },
    );
    if (!groups.length) return next();
    if (groups.length !== 1)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "El grupo de compra requiere revisión.",
      );
    if (
      collectionMatch ||
      paymentMatch?.[2] === "refund" ||
      (orderMatch &&
        route === `/${route.split("/")[1]}/orders/${orderMatch[1]}/cancel`)
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Utiliza Cancelaciones y reembolsos desde el detalle del pedido para aplicar el importe de esta tienda.",
      );
    }
    const locking = req.scope.resolve<ILockingModule>(Modules.LOCKING);
    await locking.execute(
      cartId,
      async () => {
        const journal = req.scope.resolve<CommerceAutomationService>(
          COMMERCE_AUTOMATION_MODULE,
        );
        const [state] = await journal.listCommerceGroupStates(
          { id: groups[0].id },
          { take: 1 },
        );
        if (
          state?.active_token ||
          state?.review_required ||
          paymentMatch?.[2] === "capture"
        ) {
          throw new MedusaError(
            MedusaError.Types.NOT_ALLOWED,
            "Utiliza el panel financiero del pedido; esta ruta no permite el cobro compartido ni omitir una conciliación pendiente.",
          );
        }
        const writer = { group_id: groups[0].id as string, cart_id: cartId };
        const { result: token } = await guardOrderFinanceWriterWorkflow(
          req.scope,
        ).run({ input: { ...writer, action: "claim" } });
        await new Promise<void>((resolve, reject) => {
          let finalized = false;
          const complete = (action: "finish" | "disconnect") => {
            if (finalized) return;
            finalized = true;
            res.off("finish", finished);
            res.off("close", disconnected);
            void guardOrderFinanceWriterWorkflow(req.scope)
              .run({ input: { ...writer, token, action } })
              .then(() => resolve(), reject);
          };
          const finished = () => complete("finish");
          const disconnected = () => complete("disconnect");
          res.once("finish", finished);
          res.once("close", disconnected);
          next();
        });
      },
      { timeout: 5 },
    );
  } catch (error) {
    next(error);
  }
}

export const orderFinanceMiddlewares: MiddlewareRoute[] = [
  {
    matcher:
      /^\/(?:admin|vendor)\/(?:(?:orders|payments|payment-collections)\/[^/]+(?:\/.*)?|(?:returns|claims|exchanges)(?:\/.*)?)$/i,
    method: ["POST", "DELETE"],
    middlewares: [guardOrderFinanceWriters],
  },
  {
    matcher: "/admin/orders/:id/finance",
    method: "POST",
    bodyParser: { sizeLimit: "4kb" },
    middlewares: [validateAndTransformBody(orderFinanceInputSchema)],
  },
  {
    matcher: "/vendor/orders/:id/finance",
    method: "POST",
    bodyParser: { sizeLimit: "4kb" },
    middlewares: [validateAndTransformBody(orderFinanceInputSchema)],
    policies: [
      { resource: "order", operation: PolicyOperation.update },
      { resource: "payment", operation: PolicyOperation.update },
    ],
  },
  {
    matcher: "/vendor/orders/:id/finance",
    method: "GET",
    middlewares: [],
    policies: [{ resource: "order", operation: PolicyOperation.read }],
  },
];
