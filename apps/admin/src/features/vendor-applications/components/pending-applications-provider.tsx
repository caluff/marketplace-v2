"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { getPendingApplicationStatus } from "../pending-action";
import {
  shouldRefreshPendingStatus,
  type PendingApplicationStatus,
} from "../pending-status";

const PendingContext = createContext<PendingApplicationStatus>("unknown");
export const PENDING_APPLICATIONS_CHANGED =
  "marketplace:pending-applications-changed";

export function PendingApplicationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [status, setStatus] = useState<PendingApplicationStatus>("unknown");
  const lastAttempt = useRef<number | null>(null);
  const inFlight = useRef(false);
  const needsRefresh = useRef(false);
  const refresh = useCallback((force = false) => {
    if (force && inFlight.current) {
      needsRefresh.current = true;
      return;
    }
    if (
      document.visibilityState !== "visible" ||
      !shouldRefreshPendingStatus(
        Date.now(),
        lastAttempt.current,
        inFlight.current,
        force,
      )
    )
      return;
    lastAttempt.current = Date.now();
    inFlight.current = true;
    void getPendingApplicationStatus()
      .then(setStatus, () => setStatus("unknown"))
      .finally(() => {
        inFlight.current = false;
        if (needsRefresh.current) {
          needsRefresh.current = false;
          window.dispatchEvent(new Event(PENDING_APPLICATIONS_CHANGED));
        }
      });
  }, []);

  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    const onDecision = () => {
      void refresh(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener(PENDING_APPLICATIONS_CHANGED, onDecision);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener(PENDING_APPLICATIONS_CHANGED, onDecision);
    };
  }, [refresh]);
  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);
  return <PendingContext value={status}>{children}</PendingContext>;
}

export function PendingApplicationsIndicator() {
  const status = useContext(PendingContext);
  if (status === "clear") return null;
  if (status === "unknown")
    return (
      <span
        className="ml-auto text-sidebar-muted"
        title="No se pudo confirmar si hay solicitudes pendientes"
        data-testid="pending-applications-unknown"
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Estado de solicitudes sin confirmar</span>
      </span>
    );
  return (
    <span
      className="relative ml-auto flex size-2.5 shrink-0"
      title="Hay vendedores pendientes de revisión"
      data-testid="pending-applications-indicator"
    >
      <span
        className="absolute inline-flex size-full rounded-full bg-warning opacity-60 motion-safe:animate-ping"
        aria-hidden="true"
      />
      <span
        className="relative inline-flex size-2.5 rounded-full bg-warning"
        aria-hidden="true"
      />
      <span className="sr-only">Hay vendedores pendientes de revisión</span>
    </span>
  );
}
