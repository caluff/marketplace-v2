import type { ProductDTO, ProductChangeDTO } from "@mercurjs/types";
import {
  scopedClient,
  type AuthorizeVendor,
} from "../workspace/operations";
import { resourceId, textField } from "../workspace/validation";
import { createMasterSku } from "./master-sku";

export function catalogOperations(authorize: AuthorizeVendor) {
  return {
    async editVariant(form: FormData) {
      const client = scopedClient(await authorize());
      const id = resourceId(textField(form, "id", true));
      const variantId = textField(form, "variant_id");
      if (variantId) resourceId(variantId);
      const product = await client.get<
        Pick<ProductDTO, "options" | "variants">
      >(`/vendor/products/${id}/catalog-options`);
      if (
        variantId &&
        !product.variants?.some((variant) => variant.id === variantId)
      )
        throw new Error("La variante no pertenece a este producto.");
      const options = Object.fromEntries(
        (product.options ?? []).map((option, index) => {
          const value = textField(form, `option_${index}`, true, 200);
          if (!option.values?.some((entry) => entry.value === value))
            throw new Error("Selecciona un valor disponible para cada opción.");
          return [option.title, value];
        }),
      );
      const title = textField(form, "title", true, 200);
      return client.post<{ product_change: ProductChangeDTO }>(
        `/vendor/products/${id}/variants${variantId ? `/${variantId}` : ""}`,
        {
          title,
          sku: variantId
            ? textField(form, "master_sku", true, 100)
            : createMasterSku(`${id}-${title}`),
          options,
        },
      );
    },
    async extendAxis(form: FormData) {
      const client = scopedClient(await authorize());
      const id = resourceId(textField(form, "id", true));
      const attributeId = resourceId(textField(form, "attribute_id", true));
      const values = textField(form, "values", true, 3000)
        .split(",")
        .map((value) => value.trim());
      if (
        values.length > 30 ||
        values.some((value) => !value || value.length > 100) ||
        new Set(values).size !== values.length
      )
        throw new Error(
          "Introduce hasta 30 valores distintos separados por comas.",
        );
      return client.post<{ product_change: ProductChangeDTO }>(
        `/vendor/products/${id}/attributes/batch`,
        {
          update: [
            { id: attributeId, add: values.map((value) => ({ value })) },
          ],
        },
      );
    },
  };
}
