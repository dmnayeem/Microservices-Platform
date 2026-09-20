"use client";

import { useSyncExternalStore, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Info,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  subscribeDialogs,
  getDialogSnapshot,
  resolveActiveDialog,
  type DialogRequest,
  type DialogTone,
} from "@/lib/confirm";

const TONE: Record<
  DialogTone,
  {
    icon: typeof Info;
    accent: string;
    ring: string;
    confirmBtn: string;
  }
> = {
  info: {
    icon: Info,
    accent: "text-(--app-accent-ink)",
    ring: "bg-(--app-cta)/10 ring-1 ring-(--app-accent-edge)/20",
    confirmBtn: "bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta)",
  },
  success: {
    icon: CheckCircle2,
    accent: "text-emerald-400",
    ring: "bg-emerald-500/10 ring-1 ring-emerald-500/20",
    confirmBtn: "bg-emerald-500 hover:bg-emerald-600 text-white",
  },
  warning: {
    icon: AlertTriangle,
    accent: "text-amber-400",
    ring: "bg-amber-500/10 ring-1 ring-amber-500/20",
    confirmBtn: "bg-amber-500 hover:bg-amber-600 text-(--app-on-bright)",
  },
  danger: {
    icon: AlertTriangle,
    accent: "text-red-400",
    ring: "bg-red-500/10 ring-1 ring-red-500/20",
    confirmBtn: "bg-red-500 hover:bg-red-600 text-white",
  },
};

export function ConfirmHost() {
  const active = useSyncExternalStore(
    subscribeDialogs,
    getDialogSnapshot,
    () => null
  );

  // `active` is null on the server + first client render (getServerSnapshot),
  // so createPortal/document is only reached after a dialog is triggered (client).
  if (!active) return null;
  // Key by id so local input/state resets for each new request.
  return createPortal(<DialogView key={active.id} request={active} />, document.body);
}

function DialogView({ request }: { request: DialogRequest }) {
  const { id, kind, options } = request;
  const tone = TONE[options.tone ?? "info"];
  const Icon = tone.icon;

  const [text, setText] = useState(options.defaultValue ?? "");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    // Focus the input (prompt) or the confirm button on open.
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const needsType = kind === "confirm" && !!options.requireText;
  const typeOk = !needsType || confirmText.trim() === options.requireText;
  const promptOk =
    kind !== "prompt" || !options.required || text.trim().length > 0;
  const canConfirm = typeOk && promptOk && !busy;

  const close = (value: boolean | string | null) => {
    setBusy(true);
    resolveActiveDialog(id, value);
  };
  const onCancel = () => close(kind === "prompt" ? null : false);
  const onConfirm = () => {
    if (!canConfirm) return;
    close(kind === "prompt" ? text : true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (
        e.key === "Enter" &&
        // In a multiline textarea, plain Enter inserts a newline; require Ctrl/Cmd.
        (!(kind === "prompt" && options.multiline) || e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canConfirm, text, confirmText]);

  return (
    <div
      className="fixed inset-0 z-10000 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-(--app-line) bg-(--app-surface) shadow-2xl overflow-hidden animate-sheet-up sm:animate-none pb-[env(safe-area-inset-bottom)] sm:pb-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile bottom-sheet affordance) */}
        <div className="sm:hidden mx-auto mt-2 mb-0.5 h-1.5 w-12 rounded-full bg-(--app-surface-2)" />
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
                tone.ring
              )}
            >
              <Icon className={cn("w-5 h-5", tone.accent)} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-base font-bold text-white">{options.title}</h2>
              {options.description && (
                <p className="text-sm text-(--app-ink-3) mt-1 whitespace-pre-line">
                  {options.description}
                </p>
              )}
            </div>
          </div>

          {kind === "prompt" &&
            (options.multiline ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={options.placeholder}
                rows={3}
                className="mt-4 w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge) resize-none"
              />
            ) : (
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={options.placeholder}
                className="mt-4 w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-(--app-accent-edge)"
              />
            ))}

          {needsType && (
            <div className="mt-4">
              <p className="text-xs text-(--app-ink-3) mb-1">
                Type{" "}
                <span className="font-mono font-bold text-(--app-ink)">
                  {options.requireText}
                </span>{" "}
                to confirm
              </p>
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full px-3 py-2 bg-(--app-page) border border-(--app-line) rounded-lg text-(--app-ink) text-sm focus:outline-none focus:border-red-500"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 bg-(--app-page)/40 border-t border-(--app-line)">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-sm font-semibold border border-(--app-line) transition-colors disabled:opacity-50"
          >
            {options.cancelLabel ?? "Cancel"}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              tone.confirmBtn
            )}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {options.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
