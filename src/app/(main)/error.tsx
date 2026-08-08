"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        <h1 className="text-xl font-bold text-white">Something went wrong</h1>
        <p className="mt-2 text-gray-400 text-sm">
          This section failed to load. Try again.
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
            onClick={reset}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold"
          >
            <RotateCcw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
