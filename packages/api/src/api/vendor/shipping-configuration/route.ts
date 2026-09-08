import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { configureVendorShippingWorkflow } from "../../../workflows/configure-vendor-shipping";
import type { VendorShippingConfiguration } from "./validators";

export async function POST(
  req: AuthenticatedMedusaRequest<VendorShippingConfiguration>,
  res: MedusaResponse,
) {
  await configureVendorShippingWorkflow(req.scope).run({
    input: {
      seller_id: req.seller_context?.seller_id || "",
      configuration: req.validatedBody,
    },
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ success: true });
}
