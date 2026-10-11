"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Gavel, Loader2, Sparkles, Timer } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, pts } from "@/lib/utils";

interface Auction {
  id: string;
  title: string;
  description: string | null;
  biddingEndsAt: string;
  displayHours: number;
  minBid: number;
  bidStep: number;
  topBid: number | null;
  topIsMe: boolean;
  topName: string | null;
  bidders: number;
  myBid: { amount: number; status: string; postId: string } | null;
}
interface Data {
  balance: number;
  auctions: Auction[];
  winners: { id: string; title: string; bid: number | null; at: string | null; name: string | null }[];
  posts: { id: string; text: string; createdAt: string }[];
}

function timeLeft(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "ended";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : `${h}h ${m}m left`;
}

export function SpotlightView() {
  const [data, setData] = useState<Data | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    const r = await fetch("/api/spotlight", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setData(await r.json());
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="t-title text-white inline-flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-amber-300" /> Spotlight
        </h1>
        <p className="t-body text-(--app-ink-3) mt-1">
          Bid points to feature one of your posts at the top of the feed. The highest bid when time runs out wins. If
          someone outbids you, your points come straight back — bid again any time before the end.
        </p>
      </div>

      {!data ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-(--app-accent-ink)" />
      ) : (
        <>
          <p className="t-meta text-(--app-ink-3)">
            Your balance: <b className="text-white">{pts(data.balance)} pts</b>
          </p>
          {data.auctions.length === 0 ? (
            <div className="app-card text-center text-sm text-(--app-ink-3)">No Spotlight is open right now — the next one opens soon.</div>
          ) : (
            data.auctions.map((a) => <AuctionCard key={a.id} a={a} posts={data.posts} now={now} onDone={load} />)
          )}
          {data.winners.length > 0 && (
            <div className="app-card space-y-2">
              <h2 className="t-section text-white">Recent winners</h2>
              {data.winners.map((w) => (
                <p key={w.id} className="flex items-center gap-2 text-sm text-(--app-ink-2)">
                  <Crown className="h-4 w-4 text-amber-300" />
                  <b className="text-white">{w.name}</b> won &ldquo;{w.title}&rdquo;{w.bid ? ` with ${pts(w.bid)} pts` : ""}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AuctionCard({ a, posts, now, onDone }: { a: Auction; posts: Data["posts"]; now: number; onDone: () => void }) {
  const next = a.topBid != null ? a.topBid + a.bidStep : a.minBid;
  const [amount, setAmount] = useState(String(next));
  const [postId, setPostId] = useState(a.myBid?.postId ?? posts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  const bid = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/spotlight/${a.id}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, amount: Number(amount) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't bid");
      toast.success("You're the top bid!", { description: `${pts(d.amount)} pts held until the end — returned if someone outbids you.` });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't bid");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("app-card space-y-3", a.topIsMe && "border-amber-400/50")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-black text-white">{a.title}</p>
          {a.description && <p className="text-sm text-(--app-ink-2)">{a.description}</p>}
          <p className="t-meta mt-1 text-(--app-ink-3)">Featured for {a.displayHours} hours · {a.bidders} bidder{a.bidders === 1 ? "" : "s"}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-(--app-surface-2) px-2.5 py-1 text-xs font-bold text-(--app-ink-2)">
          <Timer className="h-3.5 w-3.5" /> {timeLeft(a.biddingEndsAt, now)}
        </span>
      </div>
      <div className="rounded-xl bg-(--app-surface-2) p-3">
        <p className="t-meta text-(--app-ink-3)">Current top bid</p>
        <p className="text-2xl font-black text-amber-300">{a.topBid != null ? `${pts(a.topBid)} pts` : "No bids yet"}</p>
        {a.topBid != null && <p className="text-xs text-(--app-ink-3)">{a.topIsMe ? "That's you — you're winning." : `by ${a.topName}`}</p>}
      </div>
      {!a.topIsMe && a.myBid?.status === "OUTBID" && (
        <p className="text-xs text-amber-300">You were outbid — your {pts(a.myBid.amount)} pts are back. Bid again to win.</p>
      )}
      {posts.length === 0 ? (
        <p className="text-sm text-(--app-ink-3)">Write a public post on the feed first — that&apos;s what gets featured.</p>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs text-(--app-ink-3)">
            Post to feature
            <select
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-(--app-line) bg-(--app-surface-2) px-3 py-2.5 text-sm text-(--app-ink)"
            >
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.text || "(photo / video post)"} — {new Date(p.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={next}
              step={a.bidStep}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-(--app-line) bg-(--app-surface-2) px-3 py-2.5 text-sm text-(--app-ink)"
            />
            <button type="button" onClick={bid} disabled={busy || !postId} className="app-accent inline-flex items-center gap-1.5 rounded-xl px-4 text-sm font-black disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />} {a.topIsMe ? "Raise" : "Bid"}
            </button>
          </div>
          <p className="text-[11px] text-(--app-ink-3)">
            Minimum now: {pts(next)} pts. Only the top bid is held; the winner&apos;s points are spent when time runs out.
          </p>
        </div>
      )}
    </div>
  );
}
