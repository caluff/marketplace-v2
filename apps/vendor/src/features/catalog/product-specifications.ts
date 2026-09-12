import type { HttpTypes } from "@medusajs/types";
import { textField } from "../workspace/validation";

export const PRODUCT_MEASUREMENTS = [
  { name: "weight", label: "Peso (g)" },
  { name: "length", label: "Largo (mm)" },
  { name: "width", label: "Ancho (mm)" },
  { name: "height", label: "Alto (mm)" },
] as const;

type SpecificationField =
  | "material"
  | (typeof PRODUCT_MEASUREMENTS)[number]["name"];
type CreateSpecifications = Pick<HttpTypes.AdminCreateProduct, SpecificationField>;
type UpdateSpecifications = Pick<HttpTypes.AdminUpdateProduct, SpecificationField>;

export function productSpecifications(
  form: FormData,
  mode: "create",
): CreateSpecifications;
export function productSpecifications(
  form: FormData,
  mode: "update",
): UpdateSpecifications;
export function productSpecifications(
  form: FormData,
  mode: "create" | "update",
): UpdateSpecifications {
  const specifications: UpdateSpecifications = {};
  if (form.has("material")) {
    const material = textField(form, "material", false, 200);
    if (material) specifications.material = material;
    else if (mode === "update") specifications.material = null;
  }
  for (const { name, label } of PRODUCT_MEASUREMENTS) {
    if (!form.has(name)) continue;
    const raw = textField(form, name, false, 32);
    if (!raw) {
      if (mode === "update") specifications[name] = null;
      continue;
    }
    const value = Number(raw);
    if (
      !/^\d+(?:\.\d+)?$/.test(raw) ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > Number.MAX_SAFE_INTEGER
    ) {
      throw new Error(`Indica un valor mayor a cero para ${label.toLowerCase()}.`);
    }
    specifications[name] = value;
  }
  return specifications;
}
