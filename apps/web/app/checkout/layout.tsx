import type { Metadata } from "next"
import type { ReactNode } from "react"

import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import { getStorefrontCategories } from "@/lib/medusa"

export const metadata: Metadata = {
  title: "Finalizar compra | Marketplace V2",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  const categories = getStorefrontCategories()
  const customer = getCurrentCustomer()

  return (
    <>
      <SiteHeader categories={categories} customer={customer} />
      <main className="mx-auto min-h-[60vh] w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
        {children}
      </main>
      <SiteFooter categories={categories} />
    </>
  )
}
