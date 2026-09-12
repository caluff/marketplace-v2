import { PageHeading } from "@/features/workspace/components";

export default function OrdersLoading() {
  return (
    <div className="space-y-6">
      <PageHeading title="Pedidos de la tienda" />
      <p role="status" className="text-sm text-muted-foreground">
        Cargando pedidos…
      </p>
    </div>
  );
}
