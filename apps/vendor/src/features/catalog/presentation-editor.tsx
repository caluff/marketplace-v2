"use client";

import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EditorContext = createContext<{
  close: () => void;
  setBusy: (busy: boolean) => void;
  open: () => void;
  canEdit: boolean;
  panelId: string;
} | null>(null);
export function usePresentationEditor() {
  return useContext(EditorContext);
}

export function PresentationEditValue({ children }: { children: ReactNode }) {
  const editor = usePresentationEditor();
  if (!editor?.canEdit) {
    return <span className="text-base font-semibold">{children}</span>;
  }
  return (
    <Button
      type="button"
      variant="link"
      className="h-auto p-0 text-base font-semibold text-foreground"
      aria-expanded={false}
      aria-controls={editor.panelId}
      onClick={editor.open}
    >
      {children}
    </Button>
  );
}

export function PresentationEditor({
  title,
  subtitle,
  summary,
  form,
  inventoryLink,
}: {
  title: string;
  subtitle?: string;
  summary?: ReactNode;
  form?: ReactNode;
  inventoryLink?: ReactNode;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const shouldRestoreFocus = useRef(false);
  const panelId = useId();
  function close() {
    shouldRestoreFocus.current = true;
    setIsEditing(false);
  }
  function open() {
    if (!isBusy) setIsEditing(true);
  }
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {form && !isEditing ? (
          <Button
            ref={(button) => {
              if (button && shouldRestoreFocus.current) {
                shouldRestoreFocus.current = false;
                button.focus();
              }
            }}
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Editar ${title}`}
            aria-expanded={isEditing}
            aria-controls={panelId}
            aria-disabled={isBusy}
            onClick={open}
          >
            Editar
          </Button>
        ) : null}
      </CardHeader>
      <EditorContext.Provider
        value={{ close, setBusy, open, canEdit: Boolean(form), panelId }}
      >
        <CardContent className="space-y-4">
          {!isEditing ? summary : null}
          {isEditing ? (
            <div
              id={panelId}
              className="space-y-5"
              onKeyDown={(event) => {
                if (event.key === "Escape" && !isBusy) {
                  event.preventDefault();
                  close();
                }
              }}
            >
              {form}
            </div>
          ) : null}
          {inventoryLink}
        </CardContent>
      </EditorContext.Provider>
    </Card>
  );
}
