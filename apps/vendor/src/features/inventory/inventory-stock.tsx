import { MutationForm } from "../workspace/mutation-form";
import { updateStockAction } from "../workspace/actions";
import { warehouseLevel, type InventoryItemWithLevels } from "./data";
import type { WarehouseResult } from "./warehouse-card";

export async function InventoryStock({
  item,
  warehouse,
}: {
  item: InventoryItemWithLevels;
  warehouse: WarehouseResult;
}) {
  const verified = await warehouse;
  const stock =
    verified.data?.status === "ready"
      ? warehouseLevel(item, verified.data.location.id)
      : null;
  if (stock?.status !== "ready")
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        {!stock
          ? "Los ajustes estarán disponibles cuando se confirme el almacén aprobado."
          : stock.status === "missing"
            ? "Este artículo no tiene existencias configuradas en el almacén aprobado. Solicita al operador revisar su vinculación."
            : "Las existencias de este artículo necesitan revisión. Solicita al operador corregir las ubicaciones o cantidades antes de ajustar el stock."}
      </p>
    );
  return (
    <>
      <dl className="grid grid-cols-3 gap-4 text-sm">
        {[
          ["Físico", stock.stocked],
          ["Reservado", stock.reserved],
          ["Disponible", stock.available],
        ].map(([label, quantity]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {quantity}
            </dd>
          </div>
        ))}
      </dl>
      <MutationForm
        key={`${stock.level.id}:${stock.stocked}:${stock.reserved}`}
        action={updateStockAction}
        submit="Actualizar existencias"
        hidden={{
          id: item.id,
          location_id: stock.level.location_id,
          expected_quantity: String(stock.stocked),
        }}
        fields={[
          {
            name: "stocked_quantity",
            label: "Nuevo total físico",
            type: "number",
            value: String(stock.stocked),
            required: true,
            min: stock.reserved,
          },
        ]}
      />
    </>
  );
}

export function StockSkeleton() {
  return (
    <div
      role="status"
      aria-label="Verificando existencias en el almacén"
      className="h-40 rounded bg-muted motion-safe:animate-pulse"
    />
  );
}
