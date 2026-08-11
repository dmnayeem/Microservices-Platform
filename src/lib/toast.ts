"use client";

// Drop-in, sonner-compatible `toast` that renders success/error/warning/info
// through the centered popup card (`notifyCenter`) instead of a top-corner bar,
// and strips raw JSON (`{"error":"…"}`) from messages/descriptions.
//
// Every component imports `toast` from here instead of "sonner", so all app
// feedback shows as the centered, dimmed "square card". Advanced sonner calls
// (loading / promise / custom / dismiss) are delegated to the real sonner
// toaster, which stays mounted in the root layout. `export * from "sonner"`
// keeps `Toaster` and sonner types resolvable through this module too.

import type { ReactNode } from "react";
import { toast as sonnerToast, type ExternalToast } from "sonner";
import { notifyCenter } from "@/lib/notify-center";

export * from "sonner";

type Kind = "success" | "error" | "warning" | "info";

/**
 * Return a clean human string. If the value is a JSON string such as
 * `{"error":"Invalid payment method"}` or `{"message":"…"}` (which happens when
 * a failed `Response` body is thrown as an Error), return the inner message.
 */
function cleanText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s.startsWith("{") && s.endsWith("}")) {
    try {
      const o = JSON.parse(s) as { error?: unknown; message?: unknown };
      const inner = o?.error ?? o?.message;
      if (typeof inner === "string" && inner.trim()) return inner;
    } catch {
      /* not JSON — use the original string */
    }
  }
  return v;
}

function duration(data?: ExternalToast): number | undefined {
  return typeof data?.duration === "number" ? data.duration : undefined;
}

function make(kind: Kind) {
  return (message: ReactNode, data?: ExternalToast) => {
    // Non-string content (JSX) can't render in the text-only card → sonner.
    if (typeof message !== "string") return sonnerToast[kind](message, data);
    return notifyCenter[kind](
      cleanText(message) ?? message,
      cleanText(data?.description),
      duration(data)
    );
  };
}

function base(message: ReactNode, data?: ExternalToast) {
  if (typeof message !== "string") return sonnerToast(message, data);
  return notifyCenter.info(
    cleanText(message) ?? message,
    cleanText(data?.description),
    duration(data)
  );
}

export const toast = Object.assign(base, {
  success: make("success"),
  error: make("error"),
  warning: make("warning"),
  info: make("info"),
  message: make("info"),
  // Behaviors the centered card doesn't model — keep native sonner.
  loading: sonnerToast.loading,
  promise: sonnerToast.promise,
  custom: sonnerToast.custom,
  dismiss: sonnerToast.dismiss,
});
