"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function ImpersonateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("No impersonation token provided");
      setIsLoading(false);
      return;
    }

    const handleImpersonate = async () => {
      try {
        // Create impersonation session
        const response = await fetch(`/api/auth/impersonate/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to impersonate user");
        }

        // Redirect to dashboard after successful impersonation
        window.location.href = "/dashboard";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to impersonate user");
        setIsLoading(false);
      }
    };

    handleImpersonate();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 max-w-md w-full mx-4">
        <div className="text-center">
          {isLoading ? (
            <>
              <Loader2 className="w-12 h-12 text-indigo-400 animate-spin mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-white mb-2">
                Logging in as user...
              </h1>
              <p className="text-gray-400">
                Please wait while we authenticate your session.
              </p>
            </>
          ) : error ? (
            <>
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-red-400">✕</span>
              </div>
              <h1 className="text-xl font-semibold text-white mb-2">
                Impersonation Failed
              </h1>
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={() => router.push("/admin/users")}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Back to Users
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary for the static build shell.
export default function ImpersonatePage() {
  return (
    <Suspense fallback={null}>
      <ImpersonateInner />
    </Suspense>
  );
}
