"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { hardReload, useErrorRecovery } from "@/lib/error-recovery";

/**
 * The body of a route-segment `error.tsx`. `retry()` re-fetches the segment's
 * server components (Next 16) — `reset()` only re-rendered the cached failure.
 * "Reload page" is the fallback when the client itself is stale, and the home
 * link goes somewhere that is NOT the segment that just failed.
 */
export function ErrorCard({
  error,
  retry,
  message = "This page failed to load. Try again.",
  homeHref = "/",
  homeLabel = "Home",
  fullScreen = false,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  message?: string;
  homeHref?: string;
  homeLabel?: string;
  fullScreen?: boolean;
}) {
  useErrorRecovery(error);

  return (
    <div
      className={`flex items-center justify-center px-4 ${
        fullScreen ? "min-h-screen bg-(--app-page)" : "min-h-[60vh]"
      }`}
    >
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold text-(--app-ink)">Something went wrong</h1>
        <p className="mt-2 text-(--app-ink-3) text-sm">{message}</p>
        {error.digest && (
          <p className="mt-3 text-[11px] text-(--app-ink-3) font-mono">Ref: {error.digest}</p>
        )}
        {process.env.NODE_ENV !== "production" && error.message && (
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-(--app-surface) border border-(--app-line) p-2 text-left text-[11px] text-red-400/90 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => retry()}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-(--app-cta) hover:bg-(--app-cta) text-(--app-on-cta) text-sm font-semibold"
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
          <button
            onClick={hardReload}
            className="px-5 py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-sm font-semibold"
          >
            Reload page
          </button>
          <Link
            href={homeHref}
            className="px-5 py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-sm font-semibold"
          >
            {homeLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
