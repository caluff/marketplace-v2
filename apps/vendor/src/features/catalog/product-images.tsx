"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { ImagePlus, X } from "lucide-react";
import type { ProductImageDTO } from "@medusajs/types";
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  AttachmentTrigger,
  AttachmentGroup,
} from "@/components/ui/attachment";
import { notifyFeedback } from "@/lib/feedback";
import { CATALOG_IMAGE_COUNT, validateCatalogImages } from "./media-validation";
import { uploadCatalogImageAction } from "./upload-action";
import {
  prepareCatalogImages,
  type CatalogAttachment,
} from "./image-submission";

export type ProductImagesHandle = { prepare: () => Promise<{ url: string }[]> };

export function ProductImages({
  initialImages = [],
  disabled = false,
  onBusyChange,
  ref,
}: {
  initialImages?: Pick<ProductImageDTO, "id" | "url">[];
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
  ref: Ref<ProductImagesHandle>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  const selecting = useRef(false);
  const [images, setImages] = useState<CatalogAttachment[]>(() =>
    initialImages.map((image, index) => ({
      ...image,
      name: `Imagen ${index + 1}`,
    })),
  );
  const latestImages = useRef(images);
  const [isValidating, setIsValidating] = useState(false);
  const [message, setMessage] = useState("");
  function update(next: CatalogAttachment[]) {
    latestImages.current = next;
    setImages(next);
  }
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);
  useImperativeHandle(ref, () => ({
    prepare: () =>
      prepareCatalogImages(
        latestImages.current,
        uploadCatalogImageAction,
        (saved) => {
          const previous = latestImages.current.find(
            (image) => image.id === saved.id,
          );
          update(
            latestImages.current.map((image) =>
              image.id === saved.id ? saved : image,
            ),
          );
          if (previous && objectUrls.current.delete(previous.url))
            URL.revokeObjectURL(previous.url);
        },
      ),
  }));
  async function select(files: File[]) {
    if (!files.length || selecting.current || disabled) return;
    selecting.current = true;
    setIsValidating(true);
    onBusyChange(true);
    try {
      if (latestImages.current.length + files.length > CATALOG_IMAGE_COUNT)
        throw new Error("El producto admite hasta seis imágenes.");
      await validateCatalogImages(files);
      const additions = files.map((file) => {
        const url = URL.createObjectURL(file);
        objectUrls.current.add(url);
        return { id: crypto.randomUUID(), url, name: file.name, file };
      });
      update([...latestImages.current, ...additions]);
      setMessage("");
    } catch (error) {
      const failure =
        error instanceof Error ? error.message : "Revisa los archivos.";
      setMessage(failure);
      notifyFeedback({ status: "error", message: failure });
    } finally {
      selecting.current = false;
      setIsValidating(false);
      onBusyChange(false);
    }
  }
  return (
    <section
      className="space-y-4 border-t pt-5"
      aria-labelledby={`${id}-heading`}
    >
      <div>
        <h3 id={`${id}-heading`} className="text-sm font-medium">
          Imágenes del producto
        </h3>
        <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">
          Hasta seis imágenes PNG, JPEG o WebP de 5 MB. Se guardarán al enviar
          el producto a revisión.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp"
        multiple
        disabled={disabled || isValidating}
        aria-label="Seleccionar imágenes del producto"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void select(files);
        }}
      />
      <AttachmentGroup>
        {images.map((image, index) => (
          <Attachment
            key={image.id}
            state={disabled && image.file ? "uploading" : "done"}
          >
            <AttachmentMedia>
              <Image
                src={image.url}
                alt={`Imagen de producto ${index + 1}`}
                fill
                sizes="128px"
                unoptimized
                className="object-contain"
              />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle title={image.name}>{image.name}</AttachmentTitle>
              <AttachmentDescription>
                {image.file ? "Lista para enviar" : "Guardada"}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                aria-label={`Quitar imagen ${index + 1}`}
                disabled={disabled || isValidating}
                onClick={() => {
                  if (objectUrls.current.delete(image.url))
                    URL.revokeObjectURL(image.url);
                  update(
                    latestImages.current.filter(
                      (entry) => entry.id !== image.id,
                    ),
                  );
                }}
              >
                <X className="size-4" aria-hidden="true" />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ))}
        {images.length < CATALOG_IMAGE_COUNT ? (
          <Attachment state="idle">
            <AttachmentMedia>
              <ImagePlus
                className="size-7 text-muted-foreground"
                aria-hidden="true"
              />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>
                {isValidating ? "Validando…" : "Añadir imagen"}
              </AttachmentTitle>
              <AttachmentDescription>
                {images.length} de {CATALOG_IMAGE_COUNT} imágenes
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentTrigger
              aria-label="Añadir imagen"
              aria-describedby={`${id}-help`}
              disabled={disabled || isValidating}
              onClick={() => input.current?.click()}
            />
          </Attachment>
        ) : null}
      </AttachmentGroup>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </section>
  );
}
