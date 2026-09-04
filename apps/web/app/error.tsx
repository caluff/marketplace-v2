"use client"

import { CircleAlert, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function Error({ retry }: { retry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-16">
      <Card className="w-full max-w-xl bg-background">
        <CardHeader className="px-6 py-10 sm:px-10 sm:py-12">
          <CircleAlert
            aria-hidden="true"
            className="size-12 text-accent"
            strokeWidth={1.25}
          />
          <CardTitle className="mt-3 text-3xl">
            La vidriera necesita recomponerse
          </CardTitle>
          <CardDescription className="text-base">
            Ocurrió un error inesperado al preparar la página. Ningún dato de
            configuración se muestra acá.
          </CardDescription>
          <div className="mt-5">
            <Button type="button" variant="accent" onClick={retry}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Volver a intentar
            </Button>
          </div>
        </CardHeader>
      </Card>
    </main>
  )
}
