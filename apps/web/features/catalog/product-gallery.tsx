"use client"

import { ChevronLeft, ChevronRight, ImageIcon, ZoomIn } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { getProductImage } from "@/features/catalog/image"
import { cn } from "@/lib/utils"

export function ProductGallery({
  title,
  sources,
}: {
  title: string
  sources: string[]
}) {
  const images = sources.flatMap((source) => {
    const image = getProductImage(source)
    return image ? [image] : []
  })
  const [activeIndex, setActiveIndex] = useState(0)
  const selectedIndex = activeIndex < images.length ? activeIndex : 0
  const active = images[selectedIndex]
  const hasMultipleImages = images.length > 1

  function moveImage(direction: number) {
    setActiveIndex(
      (index) =>
        ((index < images.length ? index : 0) + direction + images.length) %
        images.length,
    )
  }

  return (
    <Dialog>
      <div
        className={cn(
          "grid min-w-0 gap-3",
          hasMultipleImages &&
            "lg:grid-cols-[3.5rem_minmax(0,1fr)] lg:items-start",
        )}
      >
        <div
          className={cn(
            "relative aspect-square overflow-hidden border border-border bg-background",
            hasMultipleImages && "lg:col-start-2 lg:row-start-1",
          )}
        >
          {active ? (
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label={`Ampliar imagen de ${title}`}
                className="group absolute inset-0 cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/40"
              >
                <Image
                  src={active.source}
                  alt={title}
                  fill
                  sizes="(max-width: 1023px) 100vw, (max-width: 1440px) 40vw, 520px"
                  unoptimized={active.unoptimized}
                  className="object-contain p-3"
                  preload
                />
                <span className="absolute right-3 bottom-3 grid size-10 place-items-center border border-border bg-background/90 text-muted-foreground transition-colors group-hover:text-foreground">
                  <ZoomIn className="size-4" aria-hidden="true" />
                </span>
              </button>
            </DialogTrigger>
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              <ImageIcon
                className="size-16"
                aria-hidden="true"
                strokeWidth={1}
              />
              <span className="sr-only">Este producto no tiene imagen</span>
            </div>
          )}
        </div>
        {hasMultipleImages ? (
          <div
            className="flex gap-2 overflow-x-auto pb-1 lg:col-start-1 lg:row-start-1 lg:max-h-112 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pb-0"
            role="group"
            aria-label="Imágenes del producto"
          >
            {images.map((image, index) => (
              <button
                key={image.source}
                type="button"
                aria-label={`Ver imagen ${index + 1} de ${title}`}
                aria-pressed={selectedIndex === index}
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "relative size-14 shrink-0 border bg-background outline-none transition-colors hover:border-foreground focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/40",
                  selectedIndex === index
                    ? "border-primary ring-1 ring-inset ring-primary"
                    : "border-border",
                )}
              >
                <Image
                  src={image.source}
                  alt=""
                  fill
                  sizes="56px"
                  loading="lazy"
                  unoptimized={image.unoptimized}
                  className="object-contain p-1"
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {active ? (
        <DialogContent
          className="h-dvh max-h-dvh w-full max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-4 border-0 p-4 sm:p-6"
          aria-describedby={undefined}
          onKeyDown={(event) => {
            if (!hasMultipleImages) return
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault()
              moveImage(event.key === "ArrowLeft" ? -1 : 1)
            }
          }}
        >
          <DialogTitle className="pr-12 text-base font-medium">
            {title}
          </DialogTitle>
          <div className="relative min-h-0">
            <Image
              src={active.source}
              alt={`${title}, imagen ${selectedIndex + 1}`}
              fill
              sizes="100vw"
              unoptimized={active.unoptimized}
              className="object-contain"
            />
          </div>
          <div className="flex items-center justify-center gap-6 pb-[env(safe-area-inset-bottom)]">
            {hasMultipleImages ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Imagen anterior"
                onClick={() => moveImage(-1)}
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </Button>
            ) : null}
            <p
              className="text-sm tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {selectedIndex + 1} / {images.length}
            </p>
            {hasMultipleImages ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Imagen siguiente"
                onClick={() => moveImage(1)}
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
