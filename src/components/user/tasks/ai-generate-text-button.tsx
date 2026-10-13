"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

/**
 * "Generate caption / comment / review …" under a text box a member copies
 * from (owner, 2026-10-13). One press writes a fresh text into that box — the
 * box's own Copy button then copies it. The admin's links and hashtags stay;
 * see lib/ai-copy-text and POST /api/tasks/[id]/ai-text.
 */
export function AiGenerateTextButton({
  taskId,
  source,
  index,
  field,
  noun,
  onText,
}: {
  taskId: string;
  source: "social" | "video";
  /** Action # (social) or step # (video). */
  index: number;
  /** "caption" or the box's field key. */
  field: string;
  /** What the box holds, for the label: "caption", "comment", "review" … */
  noun: string;
  onText: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/ai-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `${taskId}:${source}:${index}:${field}:${Date.now()}` },
        body: JSON.stringify({ source, index, field }),
      });
      const d = (await res.json().catch(() => ({}))) as { text?: string; left?: number; error?: string };
      if (typeof d.left === "number") setLeft(d.left);
      if (!res.ok || !d.text) {
        setError(d.error ?? "Couldn't generate right now. Try again.");
        return;
      }
      onText(d.text);
    } catch {
      setError("Couldn't generate right now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={run}
        disabled={busy || left === 0}
        className="app-press inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 text-sm font-bold text-(--app-ink) hover:bg-violet-500/20 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-violet-400" />}
        {busy ? `Writing your ${noun}…` : `Generate ${noun}`}
        {left !== null && !busy ? <span className="text-xs font-semibold text-(--app-ink-2)">({left} left)</span> : null}
      </button>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
