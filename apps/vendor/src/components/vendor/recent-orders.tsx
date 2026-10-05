import { RecentOrdersTable } from "@/features/orders/recent-orders-table";
import { productThumbnailsForOrderItems } from "@/features/orders/image-data";

export { ORDER_LIST_HEADERS } from "@/features/orders/recent-orders-table";

export function RecentOrders(props: Parameters<typeof RecentOrdersTable>[0]) {
  const products = productThumbnailsForOrderItems(
    props.orders.flatMap((order) => order.items ?? []),
  );
  return <RecentOrdersTable {...props} products={products} />;
}
