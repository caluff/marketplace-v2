import type { HttpTypes } from "@medusajs/types"
import { ChevronDown, ListChecks } from "lucide-react"

export function ProductDetails({
  product,
}: {
  product: HttpTypes.StoreProduct
}) {
  const specifications = [
    ...(product.material ? [["Material", product.material]] : []),
    ...(["weight", "length", "width", "height"] as const).flatMap((field) => {
      const value = product[field]
      const labels = {
        weight: "Peso",
        length: "Largo",
        width: "Ancho",
        height: "Alto",
      }
      return typeof value === "number" && Number.isFinite(value) && value > 0
        ? [[labels[field], `${value} ${field === "weight" ? "g" : "mm"}`]]
        : []
    }),
    ...(product.options ?? []).flatMap((option) => {
      const values = [
        ...new Set(
          (product.variants ?? []).flatMap((variant) =>
            (variant.options ?? [])
              .filter(
                (value) =>
                  value.option_id === option.id &&
                  value.value !== "__default__",
              )
              .map((value) => value.value),
          ),
        ),
      ]
      return values.length &&
        !["default option", "__default__"].includes(
          option.title.trim().toLowerCase(),
        )
        ? [[option.title, values.join(", ")]]
        : []
    }),
  ]

  return (
    <section
      id="product-details"
      aria-label="Detalles del producto"
      className="border border-border bg-card"
    >
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <ListChecks className="size-4 text-brand-accent" aria-hidden="true" />
        <h2 className="font-sans text-sm font-bold">Conoce este producto</h2>
      </div>
      <div className="grid divide-y divide-border md:grid-cols-[1.25fr_1fr] md:divide-x md:divide-y-0">
        <details open className="group p-5 sm:p-6">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-sans text-sm font-bold [&::-webkit-details-marker]:hidden">
            Descripción del producto
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <p className="mt-3 whitespace-pre-line break-words font-sans text-sm leading-7 text-muted-foreground">
            {product.description?.trim() ||
              product.subtitle?.trim() ||
              "La tienda todavía no agregó una descripción detallada de este producto."}
          </p>
        </details>
        <details open className="group p-5 sm:p-6">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-sans text-sm font-bold [&::-webkit-details-marker]:hidden">
            Ficha técnica
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          {specifications.length ? (
            <dl className="mt-3 divide-y divide-border font-sans text-sm">
              {specifications.map(([label, value], index) => (
                <div
                  key={`${label}-${index}`}
                  className="grid grid-cols-2 gap-4 py-3"
                >
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 font-sans text-sm leading-7 text-muted-foreground">
              La tienda todavía no agregó especificaciones técnicas.
            </p>
          )}
        </details>
      </div>
    </section>
  )
}
