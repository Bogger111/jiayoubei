"use client";
import { useEffect } from "react";
import { productStore } from "@/lib/product-store";
import { subscribeSessionChanges } from "@/lib/session-sync";

export function useSessionSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const reload = () => {
      productStore.endSession();
      productStore.retryHydrate();
    };
    const unsubscribe = subscribeSessionChanges(reload);
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) reload();
    };
    window.addEventListener("pageshow", restored);
    return () => {
      unsubscribe();
      window.removeEventListener("pageshow", restored);
    };
  }, [enabled]);
}
