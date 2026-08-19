"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Portal modal used across the ad admin (editor, campaign form, review panel).
 * Extracted from ad-manager-view so the review console can share it instead of
 * growing a second, slightly-different shell.
 */
export function ModalShell({
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Sticky action bar — keeps decide-buttons reachable in a long review. */
  footer?: React.ReactNode;
  size?: "md" | "xl";
}) {
  // Portal + stopPropagation so clicks inside the modal never reach the admin
  // page behind it (and the overlay is DOM-isolated from click-outside handlers).
  // Every caller renders this only after a user action, so there is no SSR pass
  // to guard against — the document check is just belt-and-braces.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Cap the panel to the viewport and scroll the BODY internally so a tall
          form never clips its header/top. */}
      <div
        className={cn(
          "w-full flex flex-col max-h-[92vh] rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl",
          size === "xl" ? "max-w-5xl" : "max-w-lg"
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
          <h3 className="font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-4 py-3 border-t border-slate-800 bg-slate-900/95 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
