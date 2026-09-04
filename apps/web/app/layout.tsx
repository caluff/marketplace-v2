import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "mercado / v2",
  description: "Una selección independiente impulsada por Mercur y Medusa.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
