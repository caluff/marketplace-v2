import type { ComponentProps } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function Field({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="field"
      className={cn(
        "flex flex-col gap-2 data-[invalid=true]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function FieldLabel(props: ComponentProps<typeof Label>) {
  return <Label {...props} data-slot="field-label" />;
}

function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="field-description"
      className={cn("text-xs leading-5 text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Field, FieldDescription, FieldLabel };
