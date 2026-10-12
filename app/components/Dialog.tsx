"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useDialogFocusTrap } from "./useDialogFocus";

export default function Dialog({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const close = () => {
    if (!busy) onClose();
  };
  const ref = useDialogFocusTrap(close);
  return (
    <div className="dialog-backdrop" onClick={close}>
      <div
        ref={ref}
        className="simple-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="dialog-close"
          aria-label="关闭"
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
