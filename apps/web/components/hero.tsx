import { ArrowDownRight, Sparkles } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type HeroProps = {
  productCount?: number
}

export function Hero({ productCount }: HeroProps) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden border-b border-border"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-35 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:4rem_4rem]"
      />
      <div className="relative mx-auto grid min-h-[34rem] w-full max-w-[90rem] items-end gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_19rem] lg:px-10 lg:py-24">
        <div>
          <Badge variant="outline" className="mb-8 bg-background">
            <Sparkles aria-hidden="true" />
            Selección independiente
          </Badge>
          <h1
            id="hero-title"
            className="max-w-5xl text-[clamp(3.6rem,10vw,9.5rem)] leading-[0.79] font-normal tracking-[-0.065em]"
          >
            Elegir menos.
            <br />
            <span className="text-brand-accent italic">Elegir mejor.</span>
          </h1>
        </div>

        <div className="border-t border-foreground pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <p className="font-sans text-base leading-7 text-muted-foreground">
            Piezas singulares reunidas en un catálogo vivo, directo desde su
            origen.
          </p>
          {typeof productCount === "number" && productCount > 0 ? (
            <p className="mt-5 font-sans text-xs font-bold tracking-[0.14em] uppercase">
              {productCount} {productCount === 1 ? "pieza" : "piezas"} en esta
              selección
            </p>
          ) : null}
          <Button asChild variant="accent" size="lg" className="mt-8 w-full sm:w-auto">
            <Link href="#catalog">
              Explorar catálogo
              <ArrowDownRight aria-hidden="true" className="size-5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
