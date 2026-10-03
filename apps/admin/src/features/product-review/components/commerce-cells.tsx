import type { ProductDTO } from "@mercurjs/types";
import { TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { reviewCommerceSummary, type ReviewCommerce } from "../commerce";

export function ProductReviewCommerceSkeleton() {
  return (
    <>
      <TableCell>
        <Skeleton className="h-5 w-32" aria-label="Cargando tienda" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-24" aria-label="Cargando precio" />
      </TableCell>
    </>
  );
}

export async function ProductReviewCommerceCells({
  product,
  commerce,
}: {
  product: Pick<ProductDTO, "changes" | "variants">;
  commerce: Promise<ReviewCommerce>;
}) {
  const { store, prices } = reviewCommerceSummary(product, await commerce);
  return (
    <>
      <TableCell>{store}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {prices === null
          ? "No disponible"
          : prices.length
            ? prices.map((price) => (
                <span key={price} className="block">
                  {price}
                </span>
              ))
            : "Sin precio"}
      </TableCell>
    </>
  );
}
