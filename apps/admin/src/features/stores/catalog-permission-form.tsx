"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { CatalogPermissionMode } from "@marketplace-v2/api/catalog-permission-contracts";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { withFeedbackToast } from "@/lib/feedback";
import { updateCatalogPermissionAction } from "./actions";
import {
  CATALOG_PERMISSION_LABELS,
  parseCatalogReviewMode,
  type CatalogPermissionState,
} from "./helpers";

export function CatalogPermissionForm({
  sellerId,
  sellerName,
  mode,
}: {
  sellerId: string;
  sellerName: string;
  mode: CatalogPermissionMode;
}) {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState(mode);
  const [state, action, isPending] = useActionState<
    CatalogPermissionState,
    FormData
  >(
    withFeedbackToast(updateCatalogPermissionAction.bind(null, sellerId)),
    { status: "idle" },
  );
  const savedMode = state.status === "success" ? state.mode : mode;
  const hasChanges = selectedMode !== savedMode;
  const hasFeedback = Boolean(
    state.message && (state.status === "error" || !hasChanges),
  );
  const feedbackId = `catalog-permission-feedback-${sellerId}`;

  return (
    <form action={action} className="min-w-64 space-y-2" aria-busy={isPending}>
      <div className="flex items-center gap-2">
        <NativeSelect
          name="mode"
          value={selectedMode}
          aria-label={`Permiso de catálogo de ${sellerName}`}
          aria-describedby={hasFeedback ? feedbackId : undefined}
          disabled={isPending}
          onChange={(event) => {
            const nextMode = parseCatalogReviewMode(event.target.value);
            if (nextMode) setSelectedMode(nextMode);
          }}
          className="h-9"
        >
          {Object.entries(CATALOG_PERMISSION_LABELS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={isPending || !hasChanges}
          aria-label={`Guardar permiso de catálogo de ${sellerName}`}
        >
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
      {hasFeedback && (
        <p
          id={feedbackId}
          role={state.status === "error" ? "alert" : "status"}
          className={`max-w-80 text-xs ${state.status === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {state.message}
        </p>
      )}
      {state.status === "error" && (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => router.refresh()}
        >
          Actualizar estado
        </Button>
      )}
    </form>
  );
}
