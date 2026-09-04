export const vendorRoutes = [
  { id: "dashboard", label: "Inicio", href: "/seller" },
  { id: "catalog", label: "Catálogo", href: "/seller/catalog" },
  { id: "orders", label: "Pedidos", href: "/seller/orders" },
  { id: "inventory", label: "Inventario", href: "/seller/inventory" },
  { id: "settings", label: "Ajustes", href: "/seller/settings" },
] as const;

export type VendorRouteId = (typeof vendorRoutes)[number]["id"];
