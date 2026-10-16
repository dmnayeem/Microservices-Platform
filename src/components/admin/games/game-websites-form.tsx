"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * The owner's game websites allowed to use "Connect RevType" — players there
 * sign in to RevType once and their game points go to their RevType account.
 */
export function GameWebsitesForm({ initial, canEdit }: { initial: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(initial.join("\n"));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/games/websites", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websites: text.split(/[\s,]+/).filter(Boolean) }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; websites?: string[] };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setText((d.websites ?? []).join("\n"));
      toast.success("Game websites saved");
      router.refresh();
    } catch (e) {
      toast.error("Could not save", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">Your game websites</h2>
        <p className="text-sm text-slate-400">
          The websites where your games are played outside RevType. Players there press
          &quot;Connect RevType&quot;, sign in once, and their game points go to their RevType
          account — they withdraw on RevType. Only websites listed here can connect.
        </p>
      </div>
      <label className="block text-sm text-slate-300">
        One address per line
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!canEdit}
          rows={4}
          placeholder={"https://play.mygames.com\nhttps://mygames.netlify.app"}
          className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
        />
        <span className="mt-1 block text-xs text-slate-500">
          Just the address the games open on, starting with https:// — for example{" "}
          <code className="text-slate-300">https://play.mygames.com</code>. If a game opens on a
          different address (another subdomain or host), add that one too.
        </span>
      </label>
      {canEdit && (
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save websites
        </button>
      )}
    </div>
  );
}
