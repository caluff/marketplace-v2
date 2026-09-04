export const demoMetrics = [
  {
    id: "requests",
    label: "Solicitudes por revisar",
    value: "12",
    detail: "4 marcadas como prioritarias",
    tone: "warning",
  },
  {
    id: "stores",
    label: "Tiendas en observación",
    value: "3",
    detail: "Solo registros de demostración",
    tone: "neutral",
  },
  {
    id: "catalog",
    label: "Productos en catálogo",
    value: "248",
    detail: "92% con información completa",
    tone: "success",
  },
  {
    id: "orders",
    label: "Órdenes agrupadas",
    value: "64",
    detail: "Vista estática de los últimos 7 días",
    tone: "neutral",
  },
] as const;

export const demoReviewQueue = [
  {
    id: "DEMO-PR-104",
    item: "Producto de demostración 01",
    submittedBy: "Vendedor de demostración A",
    kind: "Producto nuevo",
    age: "Hace 18 min",
    status: "Prioritario",
  },
  {
    id: "DEMO-PR-103",
    item: "Producto de demostración 02",
    submittedBy: "Vendedor de demostración B",
    kind: "Edición de producto",
    age: "Hace 1 h",
    status: "Pendiente",
  },
  {
    id: "DEMO-PR-102",
    item: "Producto de demostración 03",
    submittedBy: "Vendedor de demostración C",
    kind: "Producto nuevo",
    age: "Hace 3 h",
    status: "Pendiente",
  },
  {
    id: "DEMO-PR-101",
    item: "Producto de demostración 04",
    submittedBy: "Vendedor de demostración D",
    kind: "Edición de producto",
    age: "Ayer",
    status: "En revisión",
  },
] as const;

export const demoRequestMix = [
  { label: "Productos nuevos", value: 54 },
  { label: "Ediciones", value: 31 },
  { label: "Datos incompletos", value: 15 },
] as const;

export const DEMO_SOURCE_LABEL = "Datos de demostración" as const;
