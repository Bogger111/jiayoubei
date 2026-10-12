"use client";
import { useEffect, useState } from "react";
import { authApi } from "@/src/api/authApi";
export function useRealAuthMode(demoMode: boolean) {
  const [real, setReal] = useState(false);
  useEffect(() => {
    let active = true;
    if (!demoMode)
      void authApi
        .setupStatus()
        .then((status) => {
          if (active) setReal(status.authMode === "real");
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [demoMode]);
  return !demoMode && real;
}
