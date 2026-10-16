"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { copyText } from "@/lib/clipboard";
import { confirmDialog } from "@/lib/confirm";

/**
 * The owner's game websites allowed to use "Connect RevType" — players there
 * sign in to RevType once and their game points go to their RevType account.
 */
export function GameWebsitesForm({ initial, canEdit }: { initial: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(initial.join("\n"));
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<{ origin: string; key: string }[] | null>(null);
  const [keysBusy, setKeysBusy] = useState(false);

  const loadKeys = async () => {
    setKeysBusy(true);
    try {
      const r = await fetch("/api/admin/games/websites");
      const d = (await r.json().catch(() => ({}))) as { sites?: { origin: string; key: string }[]; error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setKeys(d.sites ?? []);
    } catch (e) {
      toast.error("Could not load keys", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setKeysBusy(false);
    }
  };

  const rotate = async (origin: string) => {
    const ok = await confirmDialog({
      title: "Make a new server key?",
      description: `The current key for ${origin} stops working immediately. Put the new key on your game server right away.`,
      confirmLabel: "Make new key",
      tone: "danger",
    });
    if (!ok) return;
    const r = await fetch("/api/admin/games/websites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin }),
    });
    const d = (await r.json().catch(() => ({}))) as { key?: string; error?: string };
    if (!r.ok || !d.key) {
      toast.error("Could not make a new key", { description: d.error });
      return;
    }
    setKeys((prev) => (prev ?? []).map((k) => (k.origin === origin ? { origin, key: d.key! } : k)));
    toast.success("New server key made");
  };

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
      {canEdit && initial.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white inline-flex items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-amber-400" /> Server keys
            </p>
            {!keys && (
              <button
                type="button"
                onClick={loadKeys}
                disabled={keysBusy}
                className="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                {keysBusy ? "Loading…" : "Show server keys"}
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Only for games whose own server decides what players earn. Put the key in your game
            server&apos;s settings (never in the game&apos;s web page). Anyone with it can add points,
            so keep it secret — if it leaks, make a new one.
          </p>
          {keys?.map((k) => (
            <div key={k.origin} className="rounded-md border border-slate-800 p-2 space-y-1">
              <p className="text-xs text-slate-400">{k.origin}</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-0 break-all rounded bg-slate-900 px-2 py-1 text-[11px] text-slate-200">{k.key}</code>
                <button
                  type="button"
                  onClick={async () => ((await copyText(k.key)) ? toast.success("Copied") : toast.error("Couldn't copy"))}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-emerald-400 hover:bg-white/5"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                <button
                  type="button"
                  onClick={() => rotate(k.origin)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-red-300 hover:bg-white/5"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> New key
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {canEdit && text.trim() !== initial.join("\n").trim() && (
        <p className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2 text-xs text-amber-200">
          Not saved yet — press <strong>Save websites</strong> below (the Save button further down the
          page saves only the limits).
        </p>
      )}

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
