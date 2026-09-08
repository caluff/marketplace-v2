"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageIcon } from "lucide-react";

export function CatalogThumbnail({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {src && !failed ? (
        <Image
          src={src}
          alt=""
          width={48}
          height={48}
          unoptimized
          className="size-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon
          className="size-5 text-muted-foreground"
          aria-label="Sin imagen"
        />
      )}
    </span>
  );
}
