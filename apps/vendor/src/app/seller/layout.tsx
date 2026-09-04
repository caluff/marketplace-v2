import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Panel de vendedor" };

export default function SellerLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
