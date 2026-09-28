"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal behavior makes the page inert and restores the opener's focus. */
export function PreviewDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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
      aria-labelledby="enlarged-preview-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="preview-dialog-heading">
        <h2 id="enlarged-preview-title">{title}</h2>
        <button className="button light small" onClick={onClose} autoFocus>
          <X size={16} />
          Close enlarged view
        </button>
      </div>
      {open ? children : null}
    </dialog>
  );
}
