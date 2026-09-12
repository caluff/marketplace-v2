import { listInput } from "../workspace/presentation";

export const ORDER_TABS = [
  { value: "all", label: "Todos", filters: {} },
  {
    value: "pending",
    label: "Pendientes",
    filters: {
      status: "pending",
      fulfillment_stage: "pending",
    },
  },
  {
    value: "fulfilled",
    label: "Preparados",
    filters: {
      status: "pending",
      fulfillment_stage: "prepared",
    },
  },
  {
    value: "shipped",
    label: "Enviados",
    filters: {
      status: "pending",
      fulfillment_stage: "shipped",
    },
  },
  {
    value: "completed",
    label: "Completados",
    filters: { status: "completed" },
  },
  { value: "canceled", label: "Cancelados", filters: { status: "canceled" } },
] as const;

const LEGACY_ORDER_TABS: Record<string, string> = {
  not_fulfilled: "pending",
  partially_fulfilled: "fulfilled",
  partially_shipped: "shipped",
  partially_delivered: "shipped",
  delivered: "shipped",
};

export function orderListInput(params: {
  q?: string;
  page?: string;
  tab?: string;
}) {
  const tabValue = params.tab
    ? (LEGACY_ORDER_TABS[params.tab] ?? params.tab)
    : "all";
  return {
    ...listInput(params),
    tab: ORDER_TABS.find((tab) => tab.value === tabValue) ?? ORDER_TABS[0],
  };
}
