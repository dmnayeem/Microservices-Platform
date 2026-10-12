"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { hardReload, useErrorRecovery } from "@/lib/error-recovery";

export default function MainError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useErrorRecovery(error);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold text-white">Something went wrong</h1>
        <p className="mt-2 text-(--app-ink-3) text-sm">
          This section failed to load. Try again.
        </p>
        {error.digest && (
          <p className="mt-3 text-[11px] text-(--app-ink-3) font-mono">Ref: {error.digest}</p>
        )}
        {/* The first line of the error, in production too: Sentry is not set
            up, so this short code on a user's screenshot is the only record of
            what went wrong. Messages carry no secrets (server errors are
            replaced by the digest above). */}
        {error.message && (
          <p className="mt-2 break-words font-mono text-[11px] text-(--app-ink-3)">
            Code: {error.name && error.name !== "Error" ? `${error.name}: ` : ""}
            {error.message.split(String.fromCharCode(10))[0].slice(0, 140)}
          </p>
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
            Reload
          </button>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg bg-(--app-surface-2) hover:bg-(--app-surface-hover) text-(--app-ink) text-sm font-semibold"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
