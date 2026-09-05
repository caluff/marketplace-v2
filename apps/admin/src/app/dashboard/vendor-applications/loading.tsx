import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoadingVendorApplications() {
  return (
    <Card aria-busy="true">
      <CardHeader>
        <CardTitle>Cargando solicitudes</CardTitle>
      </CardHeader>
      <CardContent>
        <p role="status" className="text-sm text-muted-foreground">
          Consultando los datos de Mercur…
        </p>
        <div
          aria-hidden="true"
          className="mt-5 h-40 animate-pulse bg-muted motion-reduce:animate-none"
        />
      </CardContent>
    </Card>
  );
}
