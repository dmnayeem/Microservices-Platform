"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Users, Hash, CalendarClock } from "lucide-react";
import { cn, pts } from "@/lib/utils";
import { EmptyState } from "@/components/user/primitives/empty-state";
import { ListSkeleton } from "@/components/user/primitives/skeleton";
import { CONTEST_PHASE_LABEL, CONTEST_PLATFORM_LABEL, type ContestPhase, type ContestPlatform } from "@/lib/contests";

interface Row {
  id: string;
  title: string;
  description: string;
  coverImage: string | null;
  platforms: string[];
  hashtag: string | null;
  endAt: string;
  votingEndsAt: string;
  phase: ContestPhase;
  prizes: { rank: number; points: number }[];
  entries: number;
  myEntries: number;
}

const PHASE_TONE: Record<ContestPhase, string> = {
  draft: "bg-slate-500/15 text-slate-300",
  upcoming: "bg-sky-500/15 text-sky-300",
  open: "bg-emerald-500/15 text-emerald-300",
  voting: "bg-violet-500/15 text-violet-300",
  judging: "bg-amber-500/15 text-amber-300",
  finished: "bg-slate-500/15 text-slate-300",
  cancelled: "bg-red-500/15 text-red-300",
};

export function ContestsListView() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/contests", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { contests: [] }))
      .then((d) => live && setRows(d.contests ?? []))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="t-title text-white inline-flex items-center gap-2">
          <Trophy className="h-6 w-6 text-amber-300" /> Creator Contests
        </h1>
        <p className="t-body text-(--app-ink-3) mt-1">
          Make a video or post about RevType, enter it here, and win points. Winners are picked by the team&apos;s
          score and members&apos; votes.
        </p>
      </div>

      {rows === null ? (
        <ListSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No contests right now" description="New contests are announced here — check back soon." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((c) => {
            const total = c.prizes.reduce((n, p) => n + p.points, 0);
            return (
              <Link key={c.id} href={`/contests/${c.id}`} className="app-card app-press app-lift flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", PHASE_TONE[c.phase])}>
                    {CONTEST_PHASE_LABEL[c.phase]}
                  </span>
                  {c.myEntries > 0 && <span className="text-[11px] font-bold text-emerald-300">You entered</span>}
                </div>
                <div>
                  <p className="text-lg font-black text-white">{c.title}</p>
                  <p className="t-meta text-(--app-ink-3) line-clamp-2 mt-1">{c.description}</p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 t-meta text-(--app-ink-2)">
                  <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                    <Trophy className="h-3.5 w-3.5" /> {pts(total)} pts in prizes
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {c.entries} entr{c.entries === 1 ? "y" : "ies"}
                  </span>
                  {c.hashtag && (
                    <span className="inline-flex items-center gap-1">
                      <Hash className="h-3.5 w-3.5" /> {c.hashtag.replace(/^#/, "")}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {c.phase === "open" ? `Entries close ${new Date(c.endAt).toLocaleDateString()}` : c.phase === "voting" ? `Voting ends ${new Date(c.votingEndsAt).toLocaleDateString()}` : CONTEST_PHASE_LABEL[c.phase]}
                  </span>
                </div>
                <p className="t-meta text-(--app-ink-3)">
                  {(c.platforms as ContestPlatform[]).map((p) => CONTEST_PLATFORM_LABEL[p] ?? p).join(" · ")}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
