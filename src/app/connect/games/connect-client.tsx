"use client";

import { useState } from "react";
import { Gamepad2, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";

/**
 * "Allow" step of the Connect RevType popup. The token goes back to the game
 * website by postMessage to the opener, addressed to that website's origin
 * only; without an opener (popup was blocked and opened as a tab) it returns
 * to the game with the token in the URL fragment, which the SDK reads and
 * removes. Either way it only ever reaches an origin the admin allowed.
 */
export function ConnectGamesClient({
  origin,
  returnUrl,
  name,
  email,
}: {
  origin: string | null;
  returnUrl: string | null;
  name: string;
  email: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!origin) {
    return (
      <Card>
        <h1 className="text-lg font-bold text-white">This website can&apos;t connect</h1>
        <p className="text-sm text-slate-400">
          The game website that sent you here is not approved by RevType. Close this window and
          go back to the game.
        </p>
      </Card>
    );
  }

  const host = new URL(origin).host;

  const allow = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/games/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin }),
      });
      const d = (await r.json().catch(() => ({}))) as { token?: string; name?: string; error?: string };
      if (!r.ok || !d.token) throw new Error(d.error || "Could not connect. Please try again.");
      const msg = { source: "revtype-connect", token: d.token, name: d.name };
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(msg, origin);
        setDone(true);
        setTimeout(() => window.close(), 600);
      } else if (returnUrl) {
        const u = new URL(returnUrl);
        u.hash = `revtype_token=${encodeURIComponent(d.token)}`;
        window.location.href = u.toString();
      } else {
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect. Please try again.");
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Card>
        <CheckCircle2 className="w-10 h-10 text-emerald-400" />
        <h1 className="text-lg font-bold text-white">Connected</h1>
        <p className="text-sm text-slate-400">
          You can close this window and go back to the game. Points you earn there are added to
          your RevType account.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <span className="grid place-items-center w-12 h-12 rounded-2xl bg-emerald-500/15">
        <Gamepad2 className="w-6 h-6 text-emerald-400" />
      </span>
      <h1 className="text-lg font-bold text-white">Connect RevType</h1>
      <p className="text-sm text-slate-300">
        Allow <strong className="text-white">{host}</strong> to add the points you earn in its games
        to your RevType account?
      </p>
      <div className="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-left">
        <p className="text-sm font-semibold text-white truncate">{name}</p>
        {email && <p className="text-xs text-slate-500 truncate">{email}</p>}
      </div>
      <ul className="w-full space-y-1.5 text-left text-xs text-slate-400">
        <li className="flex gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
          The game can only add game points and see your name and points balance.
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
          It never sees your password, email or wallet, and can&apos;t spend or withdraw.
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
          Withdraw your points on revtype.com, as usual.
        </li>
      </ul>
      {error && <p className="w-full text-sm text-red-400">{error}</p>}
      <div className="flex w-full gap-2">
        <button
          type="button"
          onClick={() => window.close()}
          className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={allow}
          disabled={busy}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Allow
        </button>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950 p-6 text-center shadow-xl">
      {children}
    </div>
  );
}
