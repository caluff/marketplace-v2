"use server";

import { revalidatePath } from "next/cache";
import { authorizeVendor, errorMessage } from "../workspace/data";
import type { MutationState } from "../workspace/presentation";
import { catalogOperations } from "./operations";
import { resourceId, textField } from "../workspace/validation";

const operations = catalogOperations(authorizeVendor);
export async function editVariantAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const { product_change } = await operations.editVariant(form);
    revalidatePath(`/seller/catalog/${resourceId(textField(form, "id", true))}`);
    revalidatePath("/seller/catalog");
    return {
      status: "success",
      message: `Solicitud ${product_change.id} enviada a revisión. La variante actual no cambia hasta su aprobación.`,
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
export async function extendAxisAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const { product_change } = await operations.extendAxis(form);
    revalidatePath(`/seller/catalog/${resourceId(textField(form, "id", true))}`);
    revalidatePath("/seller/catalog");
    return {
      status: "success",
      message: `Solicitud ${product_change.id} enviada a revisión. Después de la aprobación podrás proponer variantes con los nuevos valores.`,
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
