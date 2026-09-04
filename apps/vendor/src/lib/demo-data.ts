export const DEMO_DISCLAIMER =
  "Vista de demostración: todas las métricas, pedidos y alertas son datos ficticios.";

export type DemoOrderStatus = "Preparando" | "Listo" | "En revisión";

export type DemoOrder = {
  id: `DEMO-${number}`;
  customer: string;
  items: number;
  amount: number;
  status: DemoOrderStatus;
  placedAt: string;
};

export const demoOrders: DemoOrder[] = [
  {
    id: "DEMO-1048",
    customer: "Cliente ficticio A",
    items: 3,
    amount: 184.5,
    status: "Preparando",
    placedAt: "Hoy, 10:42",
  },
  {
    id: "DEMO-1047",
    customer: "Cliente ficticio B",
    items: 1,
    amount: 72,
    status: "Listo",
    placedAt: "Hoy, 09:18",
  },
  {
    id: "DEMO-1046",
    customer: "Cliente ficticio C",
    items: 2,
    amount: 126.9,
    status: "En revisión",
    placedAt: "Ayer, 18:03",
  },
  {
    id: "DEMO-1045",
    customer: "Cliente ficticio D",
    items: 4,
    amount: 248,
    status: "Preparando",
    placedAt: "Ayer, 15:27",
  },
];

export const demoMetrics = [
  {
    label: "Ventas de hoy",
    value: "USD 1.284",
    detail: "+12% vs. ayer (demo)",
    tone: "positive",
  },
  {
    label: "Por preparar",
    value: "8",
    detail: "3 requieren atención",
    tone: "attention",
  },
  {
    label: "Publicaciones activas",
    value: "42",
    detail: "4 borradores ficticios",
    tone: "neutral",
  },
  {
    label: "Stock bajo",
    value: "5",
    detail: "Revisión sugerida",
    tone: "attention",
  },
] as const;

export const demoWeeklyActivity = [
  { label: "L", value: 38 },
  { label: "M", value: 62 },
  { label: "X", value: 46 },
  { label: "J", value: 79 },
  { label: "V", value: 91 },
  { label: "S", value: 68 },
  { label: "D", value: 52 },
] as const;

export function formatDemoCurrency(amount: number) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}
