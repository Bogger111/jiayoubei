"use client";
import { useSyncExternalStore } from "react";

let current = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach((update) => update());
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
export function useCurrentTime() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => 0,
  );
}
