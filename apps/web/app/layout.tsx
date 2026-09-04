import type { Metadata } from "next"
import type { ReactNode } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

export const metadata: Metadata = {
  title: "mercado / v2",
  description: "Una selección independiente impulsada por Mercur y Medusa.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="h-full" suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="marketplace-v2-theme"
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
