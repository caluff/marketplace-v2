import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows";
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  confirmProductsWorkflow,
  createProductsWorkflow,
} from "@mercurjs/core/workflows";
import type { VendorCreateProductType } from "@mercurjs/core/api/vendor/products/validators";
import { catalogPermissionLock } from "../lib/catalog-permission/read";
import {
  prepareCatalogPermissionStep,
  type CatalogPermissionActor,
} from "./catalog-permission-prepare";

type Input = CatalogPermissionActor & { product: VendorCreateProductType };

export const catalogPermissionCreateProductWorkflow = createWorkflow(
  "catalog-permission-create-product",
  function (input: Input) {
    const lock = transform(input, ({ seller_id }) =>
      catalogPermissionLock(seller_id),
    );
    acquireLockStep(lock);
    const permission = prepareCatalogPermissionStep(
      transform(input, ({ seller_id, member_id, product }) => ({
        seller_id,
        member_id,
        mode: "create" as const,
        body: product,
      })),
    );
    const products = createProductsWorkflow.runAsStep({
      input: transform(input, ({ seller_id, product }) => {
        const { additional_data, ...payload } = product;
        return {
          products: [payload],
          created_by: seller_id,
          additional_data,
        };
      }),
    });
    when({ permission }, ({ permission }) => permission.authorized).then(() =>
      confirmProductsWorkflow.runAsStep({
        input: transform({ products, input }, ({ products, input }) => ({
          product_ids: products.map((product) => product.id),
          actor_id: input.seller_id,
          internal_note: "Publicación automática: tienda autorizada.",
        })),
      }),
    );
    releaseLockStep(lock);
    return new WorkflowResponse(
      transform({ products }, ({ products }) => ({
        product_id: products[0].id,
      })),
    );
  },
);
