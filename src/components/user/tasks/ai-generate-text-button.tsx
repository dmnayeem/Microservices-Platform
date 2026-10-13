"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";

/**
 * "Generate caption / comment / review …" under a text box a member copies
 * from (owner, 2026-10-13). One press, once per box: it writes a text made for
 * this member alone into that box — the box's own Copy button copies it — and
 * the text is saved on the server, so it is still there after a cleared
 * browser or a new phone. The admin's links and hashtags stay. See
 * lib/ai-copy-text and /api/tasks/[id]/ai-text.
 */
export function AiGenerateTextButton({
  taskId,
  source,
  index,
  field,
  noun,
  done,
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
  /** This member already has their own text in the box — no button any more. */
  done: boolean;
  onText: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (done) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> Made just for you — copy it and post it as it is.
      </p>
    );
  }

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/ai-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": `${taskId}:${source}:${index}:${field}:${Date.now()}` },
        body: JSON.stringify({ source, index, field }),
      });
      const d = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
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
        disabled={busy}
        className="app-press inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 text-sm font-bold text-(--app-ink) hover:bg-violet-500/20 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-violet-400" />}
        {busy ? `Writing your ${noun}…` : `Generate my ${noun}`}
      </button>
      <p className="text-[11px] text-(--app-ink-3)">
        One time only — you get your own {noun}, different from everyone else&apos;s, and it stays saved here.
      </p>
      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
