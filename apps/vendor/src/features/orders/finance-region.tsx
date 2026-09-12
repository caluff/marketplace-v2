import type { OrderFinanceResponse } from "@marketplace-v2/api/finance-contracts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { workspace } from "../workspace/data";
import { resourceId } from "../workspace/validation";
import { OrderFinancePanel } from "./finance-panel";

export function OrderFinanceSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Finanzas</CardTitle>
      </CardHeader>
      <CardContent>
        <Skeleton
          className="h-80 w-full"
          aria-label="Cargando información financiera"
        />
      </CardContent>
    </Card>
  );
}

export async function OrderFinanceRegion({ id }: { id: string }) {
  const { client } = await workspace();
  resourceId(id);
  let data: OrderFinanceResponse;
  try {
    data = await client.get<OrderFinanceResponse>(
      `/vendor/orders/${id}/finance`,
    );
  } catch {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Finanzas</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="text-sm text-muted-foreground">
            No se pudo cargar la información financiera. Actualiza la página
            para volver a intentarlo.
          </p>
        </CardContent>
      </Card>
    );
  }
  return <OrderFinancePanel key={JSON.stringify(data.finance)} data={data} />;
}
