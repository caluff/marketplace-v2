"use server";

import { revalidatePath } from "next/cache";
import { ProductChangeStatus } from "@mercurjs/types";
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
    revalidatePath(
      `/seller/catalog/${resourceId(textField(form, "id", true))}`,
    );
    revalidatePath("/seller/catalog");
    return {
      status: "success",
      message:
        product_change.status === ProductChangeStatus.CONFIRMED
          ? "Presentación guardada."
          : "Cambios enviados a revisión. La presentación se actualizará cuando el administrador los apruebe.",
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
    revalidatePath(
      `/seller/catalog/${resourceId(textField(form, "id", true))}`,
    );
    revalidatePath("/seller/catalog");
    return {
      status: "success",
      message:
        product_change.status === ProductChangeStatus.CONFIRMED
          ? "Valores guardados. Ya puedes añadir presentaciones con los nuevos valores."
          : "Valores enviados a revisión. Cuando el administrador los apruebe, podrás añadir presentaciones con los nuevos valores.",
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
