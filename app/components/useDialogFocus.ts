"use client";

import { useEffect, useRef } from "react";

/** Keep keyboard focus inside the dialog and restore the previous background state. */
export function useDialogFocusTrap(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const background = new Map<
      HTMLElement,
      { inert: boolean; aria: string | null }
    >();
    let branch: HTMLElement = dialog;
    while (branch.parentElement && branch.parentElement !== document.body) {
      for (const sibling of branch.parentElement.children) {
        if (
          sibling !== branch &&
          sibling instanceof HTMLElement &&
          !["SCRIPT", "STYLE"].includes(sibling.tagName)
        ) {
          background.set(sibling, {
            inert: sibling.inert,
            aria: sibling.getAttribute("aria-hidden"),
          });
        }
      }
      branch = branch.parentElement;
    }
    for (const element of background.keys()) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]),select:not([disabled]),textarea:not([disabled]),input:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.getClientRects().length > 0 && !element.closest("[inert]"),
      );
    const initialItems = focusable();
    (initialItems.find(element => element.hasAttribute("data-dialog-autofocus")) ?? initialItems[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      for (const [element, previous] of background) {
        element.inert = previous.inert;
        if (previous.aria === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", previous.aria);
      }
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return ref;
}
