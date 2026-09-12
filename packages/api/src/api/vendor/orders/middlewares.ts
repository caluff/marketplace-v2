import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MiddlewareRoute,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";

export const FulfillmentStage = z.enum(["pending", "prepared", "shipped"]);
type FulfillmentStage = z.infer<typeof FulfillmentStage>;

const requestedStages = new WeakMap<MedusaRequest, FulfillmentStage>();
const ID_BATCH_SIZE = 500;

function prepareFulfillmentStage(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (!("fulfillment_stage" in req.query)) return next();
  const parsed = FulfillmentStage.safeParse(req.query.fulfillment_stage);
  if (!parsed.success) {
    return next(new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "fulfillment_stage must be pending, prepared, or shipped.",
    ));
  }
  requestedStages.set(req, parsed.data);
  // Mercur still validates every native query parameter and applies seller scope.
  // Only this presentation filter is consumed before its strict validator.
  delete req.query.fulfillment_stage;
  next();
}

async function applyFulfillmentStage(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
) {
  const stage = requestedStages.get(req);
  if (!stage) return next();
  requestedStages.delete(req);

  try {
    const orderIds: unknown = req.filterableFields?.id;
    // Fail closed if native seller-link filtering did not run before this step.
    if (!req.seller_context?.seller_id || !Array.isArray(orderIds) ||
      !orderIds.every((id): id is string => typeof id === "string")) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Order seller scope is required.");
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const preparedOrders = new Set<string>();
    const shippedOrders = new Set<string>();

    for (let offset = 0; offset < orderIds.length; offset += ID_BATCH_SIZE) {
      const { data: links } = await query.graph({
        entity: "order_fulfillment",
        fields: ["order_id", "fulfillment_id"],
        filters: { order_id: orderIds.slice(offset, offset + ID_BATCH_SIZE) },
      }, { cache: { enable: false } });
      const owners = new Map(links.map((link) => [link.fulfillment_id, link.order_id]));
      const fulfillmentIds = [...owners.keys()];

      for (let start = 0; start < fulfillmentIds.length; start += ID_BATCH_SIZE) {
        const ids = fulfillmentIds.slice(start, start + ID_BATCH_SIZE);
        const [{ data: prepared }, { data: shipped }] = await Promise.all([
          query.graph({
            entity: "fulfillment",
            fields: ["id"],
            filters: { id: ids, canceled_at: null, packed_at: { $ne: null } },
          }, { cache: { enable: false } }),
          query.graph({
            entity: "fulfillment",
            fields: ["id"],
            filters: {
              id: ids,
              canceled_at: null,
              $or: [{ shipped_at: { $ne: null } }, { delivered_at: { $ne: null } }],
            },
          }, { cache: { enable: false } }),
        ]);
        for (const fulfillment of prepared) {
          const orderId = owners.get(fulfillment.id);
          if (orderId) preparedOrders.add(orderId);
        }
        for (const fulfillment of shipped) {
          const orderId = owners.get(fulfillment.id);
          if (orderId) shippedOrders.add(orderId);
        }
      }
    }

    // Only identifiers are intersected. The unchanged native GET/workflow performs
    // the order read, search, sorting, pagination, count and status aggregation.
    req.filterableFields.id = orderIds.filter((id) => {
      if (stage === "shipped") return shippedOrders.has(id);
      if (stage === "prepared") return preparedOrders.has(id) && !shippedOrders.has(id);
      return !preparedOrders.has(id) && !shippedOrders.has(id);
    });
    next();
  } catch (error) {
    next(error);
  }
}

export const vendorOrderStageMiddlewares: MiddlewareRoute[] = [
  {
    // Regex middleware runs before native static-route validation. The exact
    // static middleware below runs after Mercur's seller-link filter.
    matcher: /^\/vendor\/orders\/?$/,
    method: "GET",
    middlewares: [prepareFulfillmentStage],
  },
  {
    matcher: "/vendor/orders",
    method: "GET",
    middlewares: [applyFulfillmentStage],
  },
];
