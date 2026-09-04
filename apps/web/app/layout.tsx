import type { Metadata } from "next"
import { Geist_Mono, Public_Sans } from "next/font/google"
import type { ReactNode } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "mercado / v2",
  description: "Una selección independiente impulsada por Mercur y Medusa.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${publicSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
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
