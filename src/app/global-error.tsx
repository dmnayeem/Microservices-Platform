"use client";

import { hardReload, useErrorRecovery } from "@/lib/error-recovery";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useErrorRecovery(error);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0f",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          padding: "1rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Something went wrong</h1>
          <p style={{ color: "#9ca3af", marginTop: 8 }}>
            A critical error occurred. Please try again.
          </p>
          {error.digest && (
            <p style={{ color: "#4b5563", marginTop: 12, fontSize: 11, fontFamily: "monospace" }}>
              Ref: {error.digest}
            </p>
          )}
          <button
            onClick={() => retry()}
            style={{
              marginTop: 20,
              padding: "10px 20px",
              borderRadius: 8,
              background: "#6366f1",
              color: "white",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={hardReload}
            style={{
              marginTop: 20,
              marginLeft: 12,
              padding: "10px 20px",
              borderRadius: 8,
              background: "#1f2937",
              color: "white",
              border: "none",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
