"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DateField } from "@/components/ui/date-field";
import {
  Save,
  X,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  Trophy,
  Lock,
  Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  simulatePool,
  tiersTotalPercent,
  type PrizeTier,
  type FixedPrize,
} from "@/lib/lottery-prizes";

/**
 * Create/edit a lottery.
 *
 * The edit half of this form has existed since it was written but was never
 * reachable: no `[id]/edit` page rendered it with a `lottery` prop, and the
 * `PUT` it sends had no handler. Both now exist, so a lottery can finally be
 * corrected after creation.
 */

type ShortfallAction = "DRAW" | "REFUND" | "ROLLOVER";
type PrizeMode = "FIXED" | "POOL";

export interface LotteryFormValue {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  drawDate: string;
  ticketPrice: number;
  maxTickets: number | null;
  maxTicketsPerUser: number;
  prizeMode: PrizeMode;
  prizes: FixedPrize[];
  prizeTiers: PrizeTier[];
  houseCutPercent: number;
  poolSeedPoints: number;
  poolCapPoints: number | null;
  minTickets: number;
  shortfallAction: ShortfallAction;
  rolloverTargetId: string | null;
  /** Once this is > 0 the economics are frozen. */
  ticketsSold: number;
}

interface LotteryFormProps {
  lottery?: LotteryFormValue;
  /** Lotteries this one could roll its pot into. */
  rolloverCandidates?: { id: string; title: string; drawDate: string }[];
}

const inp =
  "w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
    </div>
  );
}

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function LotteryForm({ lottery, rolloverCandidates = [] }: LotteryFormProps) {
  const router = useRouter();
  const isEdit = !!lottery;
  const frozen = (lottery?.ticketsSold ?? 0) > 0;

  const [form, setForm] = useState({
    title: lottery?.title ?? "",
    description: lottery?.description ?? "",
    startDate: toLocalInput(lottery?.startDate ?? ""),
    endDate: toLocalInput(lottery?.endDate ?? ""),
    drawDate: toLocalInput(lottery?.drawDate ?? ""),
    ticketPrice: lottery?.ticketPrice ?? 100,
    maxTickets: lottery?.maxTickets != null ? String(lottery.maxTickets) : "",
    maxTicketsPerUser: lottery?.maxTicketsPerUser ?? 10,
    prizeMode: (lottery?.prizeMode ?? "FIXED") as PrizeMode,
    houseCutPercent: lottery?.houseCutPercent ?? 10,
    poolSeedPoints: lottery?.poolSeedPoints ?? 0,
    poolCapPoints: lottery?.poolCapPoints != null ? String(lottery.poolCapPoints) : "",
    minTickets: lottery?.minTickets ?? 0,
    shortfallAction: (lottery?.shortfallAction ?? "DRAW") as ShortfallAction,
    rolloverTargetId: lottery?.rolloverTargetId ?? "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const [prizes, setPrizes] = useState<FixedPrize[]>(
    lottery?.prizes?.length
      ? lottery.prizes
      : [
          { position: 1, amount: 10000, description: "Grand Prize" },
          { position: 2, amount: 5000, description: "Second Prize" },
          { position: 3, amount: 2500, description: "Third Prize" },
        ]
  );
  const [tiers, setTiers] = useState<PrizeTier[]>(
    lottery?.prizeTiers?.length
      ? lottery.prizeTiers
      : [
          { position: 1, percent: 50, description: "1st place" },
          { position: 2, percent: 30, description: "2nd place" },
          { position: 3, percent: 20, description: "3rd place" },
        ]
  );

  const [simTickets, setSimTickets] = useState(500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isPool = form.prizeMode === "POOL";
  const percentTotal = tiersTotalPercent(tiers);
  const percentOk = Math.abs(percentTotal - 100) < 0.01;

  // The admin preview runs the SAME functions the draw runs, so what is shown
  // here is what will actually be paid.
  const sim = useMemo(
    () =>
      simulatePool(
        {
          ticketsSold: simTickets,
          ticketPrice: Number(form.ticketPrice) || 0,
          houseCutPercent: Number(form.houseCutPercent) || 0,
          seedPoints: Number(form.poolSeedPoints) || 0,
          rolloverInPoints: 0,
          poolCapPoints: form.poolCapPoints ? Number(form.poolCapPoints) : null,
        },
        tiers
      ),
    [simTickets, form.ticketPrice, form.houseCutPercent, form.poolSeedPoints, form.poolCapPoints, tiers]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.title.trim()) return setError("Title is required");
    if (!form.startDate || !form.endDate || !form.drawDate) {
      return setError("All three dates are required");
    }
    if (new Date(form.endDate) <= new Date(form.startDate)) {
      return setError("Sales must close after they open.");
    }
    if (new Date(form.drawDate) < new Date(form.endDate)) {
      return setError("The draw can't happen before sales close.");
    }
    if (isPool && !percentOk) {
      return setError(`Prize tiers must total 100% — they currently total ${percentTotal.toFixed(2)}%.`);
    }
    if (!isPool && prizes.length === 0) {
      return setError("Add at least one prize.");
    }
    if (form.shortfallAction === "ROLLOVER" && !form.rolloverTargetId) {
      return setError("Pick the lottery the pot should roll over into.");
    }
    if (form.shortfallAction !== "DRAW" && form.minTickets <= 0) {
      return setError("Set a minimum ticket count — refund and rollover only apply below it.");
    }

    setLoading(true);
    try {
      // While frozen, send ONLY what the API still accepts. Sending the rest
      // would be rejected wholesale and the admin couldn't fix a typo'd title.
      const payload = frozen
        ? {
            title: form.title.trim(),
            description: form.description.trim() || null,
            drawDate: new Date(form.drawDate).toISOString(),
          }
        : {
            title: form.title.trim(),
            description: form.description.trim() || null,
            startDate: new Date(form.startDate).toISOString(),
            endDate: new Date(form.endDate).toISOString(),
            drawDate: new Date(form.drawDate).toISOString(),
            ticketPrice: Number(form.ticketPrice),
            maxTickets: form.maxTickets ? Number(form.maxTickets) : null,
            maxTicketsPerUser: Number(form.maxTicketsPerUser),
            prizeMode: form.prizeMode,
            prizes: isPool ? [] : prizes,
            prizeTiers: isPool ? tiers : null,
            houseCutPercent: Number(form.houseCutPercent),
            poolSeedPoints: Number(form.poolSeedPoints),
            poolCapPoints: form.poolCapPoints ? Number(form.poolCapPoints) : null,
            minTickets: Number(form.minTickets),
            shortfallAction: form.shortfallAction,
            rolloverTargetId: form.rolloverTargetId || null,
          };

      const res = await fetch(
        isEdit ? `/api/admin/lottery/${lottery.id}` : "/api/admin/lottery",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save lottery");
      }
      router.push("/admin/lottery");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {frozen && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-200">
            <p className="font-semibold">
              {lottery!.ticketsSold} ticket{lottery!.ticketsSold === 1 ? " has" : "s have"} been sold.
            </p>
            <p className="text-amber-200/80 mt-0.5">
              Price, prizes and the minimum are locked — people paid into these
              terms. You can still fix the title, the description, and push the
              draw date back.
            </p>
          </div>
        </div>
      )}

      <Card title="Basic information">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Weekly Grand Draw"
            className={inp}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            rows={3}
            placeholder="What this draw is about…"
            className={cn(inp, "resize-none")}
          />
        </div>
      </Card>

      <Card title="Schedule">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Sales open <span className="text-red-400">*</span>
            </label>
            <DateField
              type="datetime-local"
              value={form.startDate}
              onChange={(v) => set({ startDate: v })}
              disabled={frozen}
              className={inp}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Sales close <span className="text-red-400">*</span>
            </label>
            <DateField
              type="datetime-local"
              value={form.endDate}
              onChange={(v) => set({ endDate: v })}
              disabled={frozen}
              className={inp}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Draw <span className="text-red-400">*</span>
            </label>
            <DateField
              type="datetime-local"
              value={form.drawDate}
              onChange={(v) => set({ drawDate: v })}
              className={inp}
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          The draw runs automatically at the draw time. It must be on or after
          sales close.
        </p>
      </Card>

      <Card title="Tickets">
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Ticket price (points) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={form.ticketPrice}
              onChange={(e) => set({ ticketPrice: Number(e.target.value) || 0 })}
              disabled={frozen}
              className={inp}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Max tickets (blank = unlimited)
            </label>
            <input
              type="number"
              min={1}
              value={form.maxTickets}
              onChange={(e) => set({ maxTickets: e.target.value })}
              disabled={frozen}
              className={inp}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Max per user
            </label>
            <input
              type="number"
              min={1}
              value={form.maxTicketsPerUser}
              onChange={(e) => set({ maxTicketsPerUser: Number(e.target.value) || 1 })}
              disabled={frozen}
              className={inp}
            />
          </div>
        </div>
      </Card>

      {/* ── Prize mode ───────────────────────────────────────────────────── */}
      <Card title="Prize">
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              {
                mode: "FIXED" as const,
                label: "Fixed amounts",
                blurb: "You set the exact prizes. Paid whatever sales are.",
              },
              {
                mode: "POOL" as const,
                label: "Pool from sales",
                blurb: "The pot grows with every ticket and is split by percentage.",
              },
            ]
          ).map((o) => (
            <button
              key={o.mode}
              type="button"
              disabled={frozen}
              onClick={() => set({ prizeMode: o.mode })}
              className={cn(
                "text-left p-4 rounded-lg border transition-colors disabled:opacity-50",
                form.prizeMode === o.mode
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-gray-700 bg-gray-800 hover:border-gray-600"
              )}
            >
              <p className="font-semibold text-white text-sm">{o.label}</p>
              <p className="text-xs text-gray-400 mt-1">{o.blurb}</p>
            </button>
          ))}
        </div>

        {!isPool ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">
                Total prize pool:{" "}
                <span className="text-amber-400 font-bold">
                  {prizes.reduce((s, p) => s + p.amount, 0).toLocaleString()} pts
                </span>
              </p>
              <button
                type="button"
                disabled={frozen}
                onClick={() =>
                  setPrizes([
                    ...prizes,
                    { position: prizes.length + 1, amount: 1000, description: `Prize ${prizes.length + 1}` },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add prize
              </button>
            </div>
            {prizes.map((p, i) => (
              <div key={i} className="flex items-end gap-3">
                <div className="w-16 shrink-0">
                  <label className="block text-xs text-gray-500 mb-1">Place</label>
                  <div className="px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-center text-white">
                    {i + 1}
                  </div>
                </div>
                <div className="w-40">
                  <label className="block text-xs text-gray-500 mb-1">Points</label>
                  <input
                    type="number"
                    min={0}
                    value={p.amount}
                    disabled={frozen}
                    onChange={(e) => {
                      const next = [...prizes];
                      next[i] = { ...p, amount: Number(e.target.value) || 0 };
                      setPrizes(next);
                    }}
                    className={inp}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Label</label>
                  <input
                    type="text"
                    value={p.description}
                    disabled={frozen}
                    onChange={(e) => {
                      const next = [...prizes];
                      next[i] = { ...p, description: e.target.value };
                      setPrizes(next);
                    }}
                    className={inp}
                  />
                </div>
                {prizes.length > 1 && !frozen && (
                  <button
                    type="button"
                    onClick={() =>
                      setPrizes(
                        prizes.filter((_, j) => j !== i).map((x, j) => ({ ...x, position: j + 1 }))
                      )
                    }
                    className="p-2.5 text-gray-500 hover:text-red-400"
                    aria-label="Remove prize"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Platform cut (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={form.houseCutPercent}
                  disabled={frozen}
                  onChange={(e) => set({ houseCutPercent: Number(e.target.value) || 0 })}
                  className={inp}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Taken from ticket sales only — never from the guaranteed pot.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Guaranteed pot (points)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.poolSeedPoints}
                  disabled={frozen}
                  onChange={(e) => set({ poolSeedPoints: Number(e.target.value) || 0 })}
                  className={inp}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Your own money, added on top so a slow week still pays.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Pot ceiling (blank = none)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.poolCapPoints}
                  disabled={frozen}
                  onChange={(e) => set({ poolCapPoints: e.target.value })}
                  className={inp}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Caps your liability if it sells far more than expected.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-gray-950 border border-gray-800 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">Split</p>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-bold tabular-nums",
                      percentOk
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-red-500/15 text-red-400"
                    )}
                  >
                    Σ {percentTotal.toFixed(2)}%
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={frozen}
                    onClick={() =>
                      setTiers([{ position: 1, percent: 100, description: "Winner takes all" }])
                    }
                    className="text-xs px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                  >
                    Single winner
                  </button>
                  <button
                    type="button"
                    disabled={frozen}
                    onClick={() =>
                      setTiers([
                        ...tiers,
                        { position: tiers.length + 1, percent: 0, description: `Place ${tiers.length + 1}` },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add place
                  </button>
                </div>
              </div>

              {tiers.map((t, i) => (
                <div key={i} className="flex items-end gap-3">
                  <div className="w-16 shrink-0">
                    <label className="block text-xs text-gray-500 mb-1">Place</label>
                    <div className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-center text-white">
                      {i + 1}
                    </div>
                  </div>
                  <div className="w-32">
                    <label className="block text-xs text-gray-500 mb-1">Share (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={t.percent}
                      disabled={frozen}
                      onChange={(e) => {
                        const next = [...tiers];
                        next[i] = { ...t, percent: Number(e.target.value) || 0 };
                        setTiers(next);
                      }}
                      className={inp}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Label</label>
                    <input
                      type="text"
                      value={t.description}
                      disabled={frozen}
                      onChange={(e) => {
                        const next = [...tiers];
                        next[i] = { ...t, description: e.target.value };
                        setTiers(next);
                      }}
                      className={inp}
                    />
                  </div>
                  {tiers.length > 1 && !frozen && (
                    <button
                      type="button"
                      onClick={() =>
                        setTiers(
                          tiers.filter((_, j) => j !== i).map((x, j) => ({ ...x, position: j + 1 }))
                        )
                      }
                      className="p-2.5 text-gray-500 hover:text-red-400"
                      aria-label="Remove place"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
              {!percentOk && (
                <p className="text-xs text-red-400">
                  The shares must add up to exactly 100% before this can be saved.
                </p>
              )}
            </div>

            {/* Simulator — same functions the draw uses. */}
            <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/25 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Calculator className="w-4 h-4 text-indigo-400" />
                <p className="text-sm font-semibold text-white">If it sells</p>
                <input
                  type="number"
                  min={0}
                  value={simTickets}
                  onChange={(e) => setSimTickets(Math.max(0, Number(e.target.value) || 0))}
                  className="w-28 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
                />
                <p className="text-sm text-gray-400">tickets…</p>
              </div>
              <p className="text-sm text-gray-300 tabular-nums">
                {simTickets.toLocaleString()} × {Number(form.ticketPrice).toLocaleString()} ={" "}
                <span className="text-white font-semibold">{sim.pool.gross.toLocaleString()}</span>{" "}
                gross − <span className="text-amber-400">{sim.pool.houseCut.toLocaleString()}</span>{" "}
                platform cut
                {Number(form.poolSeedPoints) > 0 && (
                  <>
                    {" "}+ <span className="text-emerald-400">{Number(form.poolSeedPoints).toLocaleString()}</span>{" "}
                    guaranteed
                  </>
                )}{" "}
                → pot <span className="text-white font-bold">{sim.pool.pool.toLocaleString()}</span>
                {sim.pool.overflow > 0 && (
                  <span className="text-gray-500"> (capped; {sim.pool.overflow.toLocaleString()} retained)</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {sim.awards.map((a) => (
                  <span
                    key={a.position}
                    className="px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs text-gray-300"
                  >
                    <Trophy className="w-3 h-3 inline mr-1 text-amber-400" />
                    {a.description}:{" "}
                    <span className="text-white font-bold tabular-nums">
                      {a.amount.toLocaleString()}
                    </span>
                  </span>
                ))}
                {sim.awards.length === 0 && (
                  <span className="text-xs text-gray-500">
                    Nothing to pay — no tickets sold in this scenario.
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ── Minimum tickets ──────────────────────────────────────────────── */}
      <Card title="If it doesn't sell enough">
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Minimum tickets (0 = no minimum)
          </label>
          <input
            type="number"
            min={0}
            value={form.minTickets}
            disabled={frozen}
            onChange={(e) => set({ minTickets: Number(e.target.value) || 0 })}
            className={inp}
          />
        </div>

        <div className="space-y-2">
          {(
            [
              {
                v: "DRAW" as const,
                label: "Draw anyway",
                say: "Winners are picked from whoever entered. The prize may be small.",
              },
              {
                v: "REFUND" as const,
                label: "Refund everyone",
                say: "The draw is cancelled and every ticket price is returned. Safest for players.",
              },
              {
                v: "ROLLOVER" as const,
                label: "Roll the pot into another draw",
                say: "The pot moves to the lottery you pick. Tickets are NOT refunded — this is shown to players before they buy.",
              },
            ]
          ).map((o) => (
            <label
              key={o.v}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                form.shortfallAction === o.v
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-gray-800 bg-gray-950 hover:border-gray-700",
                frozen && "opacity-50 cursor-not-allowed"
              )}
            >
              <input
                type="radio"
                name="shortfall"
                checked={form.shortfallAction === o.v}
                disabled={frozen}
                onChange={() => set({ shortfallAction: o.v })}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-white">{o.label}</span>
                <span className="block text-xs text-gray-400 mt-0.5">{o.say}</span>
              </span>
            </label>
          ))}
        </div>

        {form.shortfallAction === "ROLLOVER" && (
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Roll the pot into
            </label>
            <select
              value={form.rolloverTargetId}
              disabled={frozen}
              onChange={(e) => set({ rolloverTargetId: e.target.value })}
              className={inp}
            >
              <option value="">— Pick a lottery —</option>
              {rolloverCandidates
                .filter((c) => c.id !== lottery?.id)
                .map((c) => (
                  <option key={c.id} value={c.id} className="bg-gray-900">
                    {c.title} (draws {new Date(c.drawDate).toLocaleDateString()})
                  </option>
                ))}
            </select>
            {rolloverCandidates.length === 0 && (
              <p className="text-xs text-amber-400 mt-1">
                There are no future lotteries to roll into yet. Create one first,
                or pick refund instead.
              </p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">
              If that lottery is cancelled or already drawn when this one ends,
              everyone is refunded instead — the pot is never left stranded.
            </p>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => router.push("/admin/lottery")}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          {isEdit ? "Save changes" : "Create lottery"}
        </button>
      </div>
    </form>
  );
}
