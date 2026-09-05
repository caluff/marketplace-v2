"use client";

import { CircleCheck, CircleAlert, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster"
      richColors
      closeButton
      position="bottom-right"
      containerAriaLabel="Notificaciones"
      icons={{
        success: <CircleCheck className="size-5" />,
        error: <CircleAlert className="size-5" />,
        warning: <TriangleAlert className="size-5" />,
        info: <Info className="size-5" />,
        loading: <LoaderCircle className="size-5 animate-spin" />,
      }}
      toastOptions={{
        classNames: { toast: "marketplace-vendor-toast" },
        closeButtonAriaLabel: "Cerrar notificación",
      }}
      {...props}
    />
  );
}
