import { LogOut, ShieldX } from "lucide-react";
import type { Metadata } from "next";

import { logoutVendorAction } from "@/app/seller/auth-actions";
import { Button } from "@/components/ui/button";
import { VendorAuthShell } from "@/components/vendor/vendor-auth-shell";

export const metadata: Metadata = { title: "Sin tienda disponible" };
export default function NoVendorAccessPage() { return <VendorAuthShell title="Sin tienda disponible" description="La identidad es válida, pero no tiene una membresía activa en una tienda disponible."><div className="space-y-5"><div className="rounded-lg border border-warning/55 bg-warning/10 p-4 text-sm leading-6"><ShieldX className="mb-3 size-5" aria-hidden="true" />Pide a un administrador de la tienda que revise tu membresía. No se crean vendedores ni altas públicas desde este portal.</div><form action={logoutVendorAction}><Button type="submit" variant="outline" className="h-11 w-full"><LogOut aria-hidden="true" /> Cerrar sesión</Button></form></div></VendorAuthShell>; }
