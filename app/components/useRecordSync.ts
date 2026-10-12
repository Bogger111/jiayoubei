"use client";

import { useEffect } from "react";
import { productStore } from "@/lib/product-store";

export function useRecordSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let lastAttempt = Date.now();
    const refresh = () => {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        Date.now() - lastAttempt < 2000
      )
        return;
      lastAttempt = Date.now();
      void productStore.refreshRecords();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled]);
}
