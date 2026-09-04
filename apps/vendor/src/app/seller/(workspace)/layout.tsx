import type { ReactNode } from "react";

import { VendorShell } from "@/components/vendor/vendor-shell";

export default function VendorWorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <VendorShell>{children}</VendorShell>;
}
