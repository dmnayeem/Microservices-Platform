"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";

export function AppealForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token ?? undefined, message }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "Could not send your appeal. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not send your appeal. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const short = message.trim().length < 20;
  return (
    <div className="rounded-2xl border border-(--app-line) bg-(--app-surface) p-5 space-y-3">
      <label htmlFor="appeal-msg" className="block text-sm font-semibold text-(--app-ink)">
        Appeal this suspension
      </label>
      <textarea
        id="appeal-msg"
        rows={5}
        maxLength={3000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Explain what happened. If you believe this is a mistake, say why."
        className="w-full rounded-lg border border-(--app-line) bg-(--app-page) px-3 py-2 text-sm text-(--app-ink) placeholder:text-(--app-ink-3) focus:outline-none focus:border-blue-500 resize-none"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy || short}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Send appeal
      </button>
      {short && <p className="text-xs text-(--app-ink-3)">At least 20 characters.</p>}
    </div>
  );
}
