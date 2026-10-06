"use client";

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { hardReload, useErrorRecovery } from "@/lib/error-recovery";

export default function AdminError({
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
        <p className="mt-2 text-gray-400 text-sm">
          This admin section failed to load. Try again.
        </p>
        {error.digest && (
          <p className="mt-3 text-[11px] text-gray-600 font-mono">Ref: {error.digest}</p>
        )}
        {process.env.NODE_ENV !== "production" && error.message && (
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-gray-900 border border-gray-800 p-2 text-left text-[11px] text-red-400/90 whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => retry()}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold"
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
          <button
            onClick={hardReload}
            className="px-5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
          >
            Reload
          </button>
          <Link
            href="/admin"
            className="px-5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
          >
            Admin
          </Link>
        </div>
      </div>
    </div>
  );
}
