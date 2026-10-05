import type { ReactNode } from "react";
import type { ProductDTO, ProductVariantDTO } from "@mercurjs/types";
import { PresentationEditor } from "./presentation-editor";
import { VariantForm } from "./variant-form";
import { createMasterSku } from "./master-sku";
import { hasPresentationOptions } from "./variant-options";

export function PresentationCard({
  product,
  variant,
  hasPending,
  summary,
  priceForm,
  inventoryLink,
}: {
  product: ProductDTO;
  variant: ProductVariantDTO;
  hasPending: boolean;
  summary?: ReactNode;
  priceForm?: ReactNode;
  inventoryLink?: ReactNode;
}) {
  const options =
    variant.options?.filter(({ value }) => value !== "__default__") ?? [];
  const subtitle = options.length
    ? options
        .map(({ value, option }) =>
          option?.title && option.title !== "__default__"
            ? `${option.title}: ${value}`
            : value,
        )
        .join(" · ")
    : undefined;
  const hasOptions = hasPresentationOptions(product);
  const name = (hasOptions ? variant.title : product.title)?.trim() ?? "";
  return (
    <PresentationEditor
      title={name || "Sin nombre"}
      subtitle={subtitle}
      summary={summary}
      inventoryLink={inventoryLink}
      form={
        priceForm ??
        (!hasPending && hasOptions ? (
          <VariantForm
            product={product}
            variant={variant}
            defaultSku={variant.sku || createMasterSku(variant.title)}
          />
        ) : undefined)
      }
    />
  );
}
