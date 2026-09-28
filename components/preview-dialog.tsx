"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal behavior makes the page inert and restores the opener's focus. */
export function PreviewDialog({
  open,
  title,
  onClose,
  children,
  closeLabel = "Close enlarged view",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="preview-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="preview-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="button light small" onClick={onClose} autoFocus>
          <X size={16} />
          {closeLabel}
        </button>
      </div>
      {open ? children : null}
    </dialog>
  );
}
