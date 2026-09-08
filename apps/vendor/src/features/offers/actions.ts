"use server";

import { revalidatePath } from "next/cache";
import { authorizeVendor, errorMessage } from "../workspace/data";
import type { MutationState } from "../workspace/presentation";
import { offerOperations } from "./operations";
import { resourceId } from "../workspace/validation";

const operations = offerOperations(authorizeVendor);
export async function saveOfferAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const { offer } = form.get("offer_id")
      ? await operations.update(form)
      : await operations.create(form);
    revalidatePath(`/seller/catalog/${resourceId(offer.product_id)}`);
    revalidatePath("/seller/catalog");
    revalidatePath("/seller/inventory");
    revalidatePath("/seller");
    return {
      status: "success",
      message: form.get("offer_id")
        ? "Precio guardado."
        : "Precio y existencias iniciales guardados.",
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
