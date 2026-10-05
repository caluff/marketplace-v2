"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSellerNotifications } from "../workspace/seller-notifications";
import { createSettlementRefreshQueue } from "./refresh-queue";

export function SettlementAutoRefresh({ sellerId }: { sellerId: string }) {
  const router = useRouter();
  const notifications = useSellerNotifications(sellerId);
  const [isPending, startTransition] = useTransition();
  const queueRef = useRef<ReturnType<
    typeof createSettlementRefreshQueue
  > | null>(null);

  useEffect(() => {
    const queue = createSettlementRefreshQueue(() =>
      startTransition(() => router.refresh()),
    );
    queueRef.current = queue;
    const unsubscribe = notifications?.subscribe({
      eventName: "settlements-changed",
      onReady: queue.request,
      onChanged: queue.request,
      onUnavailable: () => {},
    });
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") queue.cancelPending();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    onVisibilityChange();
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unsubscribe?.();
      queue.dispose();
      queueRef.current = null;
    };
  }, [router, notifications]);

  useEffect(() => {
    if (!isPending) queueRef.current?.settled();
  }, [isPending]);

  return null;
}
