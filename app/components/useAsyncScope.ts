"use client";
import { useEffect, useRef } from "react";
import { productStore } from "@/lib/product-store";

export function useAsyncScope() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return () => {
    const sameSession = productStore.captureSession();
    return () => mounted.current && sameSession();
  };
}
