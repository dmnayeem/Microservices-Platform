"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ExternalLink, Heart, Loader2, Medal, Send, Trophy } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn, pts } from "@/lib/utils";
import { Avatar } from "@/components/user/primitives/avatar";
import { VerifiedBadge, badgeRingStyle } from "@/components/user/profile/verified-badge";
import {
  CONTEST_PHASE_LABEL,
  CONTEST_PLATFORM_LABEL,
  type ContestPhase,
  type ContestPlatform,
} from "@/lib/contests";

interface Contest {
  id: string;
  title: string;
  description: string;
  rules: string | null;
  platforms: string[];
  hashtag: string | null;
  startAt: string;
  endAt: string;
  votingEndsAt: string;
  minLevelToEnter: number;
  minLevelToVote: number;
  maxEntriesPerUser: number;
  voteWeightPct: number;
  prizes: { rank: number; points: number }[];
  participationPoints: number;
  phase: ContestPhase;
}
interface Entry {
  id: string;
  url: string;
  platform: string;
  caption: string | null;
  votes: number;
  rank: number | null;
  prizePoints: number | null;
  position: number | null;
  mine: boolean;
  user: {
    id: string;
    name: string | null;
    username: string | null;
    avatar: string | null;
    isBlueVerified: boolean;
    verifiedBadgeStyle: string | null;
  } | null;
}
interface Mine {
  id: string;
  url: string;
  status: string;
  rejectReason: string | null;
  votes: number;
  rank: number | null;
  prizePoints: number | null;
  linkCheck: string | null;
}
interface Data {
  contest: Contest;
  myLevel: number;
  entries: Entry[];
  mine: Mine[];
  myVoteEntryId: string | null;
}

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

export function ContestDetailView({ contestId }: { contestId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/contests/${contestId}`, { cache: "no-store" }).catch(() => null);
    if (!r || !r.ok) {
      setMissing(true);
      return;
    }
    setData(await r.json());
  }, [contestId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  if (missing) {
    return (
      <div className="app-card text-center text-sm text-(--app-ink-3)">
        This contest isn&apos;t available. <Link href="/contests" className="text-(--app-accent-ink)">See all contests</Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-(--app-accent-ink)" />
      </div>
    );
  }

  const { contest: c, entries, mine, myVoteEntryId, myLevel } = data;
  const canEnter =
    c.phase === "open" &&
    myLevel >= c.minLevelToEnter &&
    mine.filter((m) => m.status !== "REJECTED").length < c.maxEntriesPerUser;
  const votingOpen = c.phase === "open" || c.phase === "voting";
  const canVote = votingOpen && myLevel >= c.minLevelToVote && !myVoteEntryId;

  const enter = async () => {
    setBusy("enter");
    try {
      const r = await fetch(`/api/contests/${c.id}/enter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, caption }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't enter");
      toast.success("Entry sent!", {
        description:
          d.linkCheck === "NO_HASHTAG" && c.hashtag
            ? `We couldn't find ${c.hashtag} in your post — add it so the team can approve your entry.`
            : "The team will review it, then it appears in the gallery for votes.",
      });
      setUrl("");
      setCaption("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't enter");
    } finally {
      setBusy(null);
    }
  };

  const vote = async (entryId: string) => {
    setBusy(entryId);
    try {
      const r = await fetch(`/api/contests/${c.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Couldn't vote");
      toast.success("Vote counted — thank you!");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't vote");
    } finally {
      setBusy(null);
    }
  };

  const prizeTotal = c.prizes.reduce((n, p) => n + p.points, 0);

  return (
    <div className="space-y-5">
      <Link href="/contests" className="inline-flex items-center gap-1.5 text-sm text-(--app-ink-3) hover:text-(--app-ink)">
        <ArrowLeft className="h-4 w-4" /> All contests
      </Link>

      <div className="app-card space-y-3">
        <span className="rounded-full bg-(--app-surface-2) px-2.5 py-0.5 text-[11px] font-bold text-(--app-ink-2)">
          {CONTEST_PHASE_LABEL[c.phase]}
        </span>
        <h1 className="text-2xl font-black text-white">{c.title}</h1>
        <p className="whitespace-pre-line text-sm text-(--app-ink-2)">{c.description}</p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p className="text-(--app-ink-3)">
            Where: <b className="text-white">{(c.platforms as ContestPlatform[]).map((p) => CONTEST_PLATFORM_LABEL[p] ?? p).join(", ")}</b>
          </p>
          {c.hashtag && (
            <p className="text-(--app-ink-3)">
              Must include: <b className="text-white">{c.hashtag}</b>
            </p>
          )}
          <p className="text-(--app-ink-3)">
            Entries close: <b className="text-white">{new Date(c.endAt).toLocaleString()}</b>
          </p>
          <p className="text-(--app-ink-3)">
            Voting ends: <b className="text-white">{new Date(c.votingEndsAt).toLocaleString()}</b>
          </p>
        </div>
        <div className="rounded-xl bg-(--app-surface-2) p-3">
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-300">
            <Trophy className="h-4 w-4" /> {pts(prizeTotal)} points in prizes
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {c.prizes.map((p) => (
              <span key={p.rank} className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-200">
                {ordinal(p.rank)}: {pts(p.points)} pts
              </span>
            ))}
            {c.participationPoints > 0 && (
              <span className="rounded-lg bg-(--app-surface) px-2.5 py-1 text-xs text-(--app-ink-2)">
                Every approved entry: {pts(c.participationPoints)} pts
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-(--app-ink-3)">
            Winners are picked by the team&apos;s score ({100 - c.voteWeightPct}%) and members&apos; votes ({c.voteWeightPct}%).
            Free to enter. One prize per person.
          </p>
        </div>
        {c.rules && (
          <details className="text-sm text-(--app-ink-2)">
            <summary className="cursor-pointer font-bold text-white">Rules</summary>
            <p className="mt-2 whitespace-pre-line">{c.rules}</p>
          </details>
        )}
      </div>

      {mine.length > 0 && (
        <div className="app-card space-y-2">
          <h2 className="t-section text-white">Your entries</h2>
          {mine.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-(--app-surface-2) p-3 text-sm">
              <a href={m.url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate text-(--app-accent-ink)">
                {m.url}
              </a>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  m.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-300" : m.status === "REJECTED" ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"
                )}
              >
                {m.status === "APPROVED" ? "In the gallery" : m.status === "REJECTED" ? "Not approved" : "Waiting for review"}
              </span>
              {m.status === "APPROVED" && <span className="text-xs text-(--app-ink-3)">{m.votes} votes</span>}
              {m.rank && <span className="text-xs font-bold text-amber-300">#{m.rank} · {pts(m.prizePoints ?? 0)} pts</span>}
              {m.status === "REJECTED" && m.rejectReason && <p className="w-full text-xs text-red-300">{m.rejectReason}</p>}
            </div>
          ))}
        </div>
      )}

      {c.phase === "open" && (
        <div className="app-card space-y-3">
          <h2 className="t-section text-white">Enter the contest</h2>
          {canEnter ? (
            <>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Link to your public post (https://…)"
                className="w-full rounded-xl border border-(--app-line) bg-(--app-surface-2) px-3 py-2.5 text-sm text-(--app-ink)"
              />
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={300}
                placeholder="One line about it (optional)"
                className="w-full rounded-xl border border-(--app-line) bg-(--app-surface-2) px-3 py-2.5 text-sm text-(--app-ink)"
              />
              <button
                type="button"
                onClick={enter}
                disabled={busy === "enter" || !url.trim()}
                className="app-accent inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black disabled:opacity-60"
              >
                {busy === "enter" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send my entry
              </button>
              <p className="text-xs text-(--app-ink-3)">The post must be public and your own work. The team reviews every entry.</p>
            </>
          ) : (
            <p className="text-sm text-(--app-ink-3)">
              {myLevel < c.minLevelToEnter
                ? `Reach level ${c.minLevelToEnter} to enter.`
                : "You've used all your entries for this contest."}
            </p>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="t-section text-white">{c.phase === "finished" ? "Results" : "Gallery"}</h2>
          {votingOpen && (
            <p className="text-xs text-(--app-ink-3)">
              {myVoteEntryId ? (
                <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> You voted</span>
              ) : myLevel < c.minLevelToVote ? (
                `Level ${c.minLevelToVote}+ can vote`
              ) : (
                "One vote per member"
              )}
            </p>
          )}
        </div>
        {entries.length === 0 ? (
          <div className="app-card text-center text-sm text-(--app-ink-3)">No approved entries yet.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {entries.map((e) => {
              const winner = c.phase === "finished" && e.rank != null && e.rank <= c.prizes.length;
              return (
                <div key={e.id} className={cn("app-card space-y-2", winner && "border-amber-400/50")}>
                  <div className="flex items-center gap-2.5">
                    {e.position && (
                      <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black", e.position <= 3 ? "bg-amber-500/20 text-amber-200" : "bg-(--app-surface-2) text-(--app-ink-3)")}>
                        {e.position <= 3 ? <Medal className="h-3.5 w-3.5" /> : e.position}
                      </span>
                    )}
                    <Avatar
                      src={e.user?.avatar}
                      size={36}
                      name={e.user?.name}
                      ring={e.user?.isBlueVerified ? badgeRingStyle(e.user.verifiedBadgeStyle) : null}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="inline-flex items-center gap-1 truncate font-bold text-white">
                        {e.user?.name ?? "Member"}
                        {e.user?.isBlueVerified && <VerifiedBadge style={e.user.verifiedBadgeStyle} size="sm" />}
                      </p>
                      <p className="text-xs text-(--app-ink-3)">{CONTEST_PLATFORM_LABEL[e.platform as ContestPlatform] ?? e.platform}</p>
                    </div>
                    {winner && <span className="text-xs font-black text-amber-300">{ordinal(e.rank!)} · {pts(e.prizePoints ?? 0)} pts</span>}
                  </div>
                  {e.caption && <p className="text-sm text-(--app-ink-2)">{e.caption}</p>}
                  <div className="flex items-center gap-2">
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-(--app-line) py-2 text-xs font-bold text-(--app-ink-2) hover:text-(--app-ink)"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Watch
                    </a>
                    {votingOpen && !e.mine && (
                      <button
                        type="button"
                        onClick={() => vote(e.id)}
                        disabled={!canVote || busy !== null}
                        className={cn(
                          "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold disabled:opacity-60",
                          myVoteEntryId === e.id ? "bg-pink-500/20 text-pink-200" : "app-accent"
                        )}
                      >
                        {busy === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Heart className="h-3.5 w-3.5" />}
                        {myVoteEntryId === e.id ? "Your vote" : "Vote"}
                      </button>
                    )}
                    <span className="text-xs text-(--app-ink-3)">{e.votes} votes</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
