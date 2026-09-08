"use client"

import { ImageIcon } from "lucide-react"
import Image from "next/image"
import { useState } from "react"
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
  const active = images[activeIndex] ?? images[0]

  return (
    <div>
      <div className="relative aspect-[4/5] overflow-hidden border border-border bg-muted">
        {active ? (
          <a
            href={active.source}
            target="_blank"
            rel="noreferrer"
            aria-label={`Ampliar imagen de ${title}`}
            className="absolute inset-0 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <Image
              src={active.source}
              alt={title}
              fill
              sizes="(max-width: 768px) 100vw, 55vw"
              unoptimized={active.unoptimized}
              className="object-contain"
              preload
            />
          </a>
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <ImageIcon className="size-16" aria-hidden="true" strokeWidth={1} />
            <span className="sr-only">Este producto no tiene imagen</span>
          </div>
        )}
      </div>
      {images.length > 1 ? (
        <div
          className="mt-3 flex gap-3 overflow-x-auto pb-2"
          aria-label="Imágenes del producto"
        >
          {images.map((image, index) => (
            <button
              key={image.source}
              type="button"
              aria-label={`Ver imagen ${index + 1} de ${title}`}
              aria-pressed={activeIndex === index}
              onClick={() => setActiveIndex(index)}
              className={cn(
                "relative size-20 shrink-0 border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                activeIndex === index ? "border-foreground" : "border-border",
              )}
            >
              <Image
                src={image.source}
                alt=""
                fill
                sizes="80px"
                loading="lazy"
                unoptimized={image.unoptimized}
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
