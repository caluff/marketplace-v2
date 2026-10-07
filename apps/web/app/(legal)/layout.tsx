import type { Metadata } from "next"
import type { ReactNode } from "react"
import { SiteFooter } from "@/components/site-footer"
import { getStorefrontCategories } from "@/lib/medusa"

export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <SiteFooter categories={getStorefrontCategories()} />
    </>
  )
}
