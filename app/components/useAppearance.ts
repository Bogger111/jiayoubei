"use client";

import { useEffect, useState } from "react";

const key = "jyb-appearance-v1";
export type Appearance = { largeText: boolean; reduceMotion: boolean };
const defaults: Appearance = { largeText: false, reduceMotion: false };
function read(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    return {
      largeText: value.largeText === true,
      reduceMotion: value.reduceMotion === true,
    };
  } catch {
    return defaults;
  }
}
function apply(value: Appearance) {
  document.documentElement.dataset.largeText = String(value.largeText);
  document.documentElement.dataset.reduceMotion = String(value.reduceMotion);
}
export function useAppearance() {
  const [appearance, setAppearance] = useState(defaults);
  useEffect(() => {
    const refresh = () => {
      const value = read();
      apply(value);
      setAppearance(value);
    };
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("jyb-appearance", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("jyb-appearance", refresh);
    };
  }, []);
  const changeAppearance = (patch: Partial<Appearance>) => {
    const next = { ...read(), ...patch };
    localStorage.setItem(key, JSON.stringify(next));
    apply(next);
    setAppearance(next);
    window.dispatchEvent(new Event("jyb-appearance"));
  };
  return { appearance, changeAppearance };
}
