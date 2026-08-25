"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { usd } from "@/lib/utils";
import { AD_PLACEMENTS } from "@/lib/ad-placements";
import { ModalShell } from "@/components/admin/ads/modal-shell";

/**
 * Slot bookings — spaces sold outright for a period.
 *
 * This is the direct-sales product. CPC only ever suited self-serve advertisers;
 * telling a client "this banner is yours for a month" is how a publisher this
 * size actually earns, and there was no way to express it: `AdPlacement` carried
 * no price of any kind, and selection was a weighted-random draw with no
 * reference to money, so a $5 campaign and a $5,000 campaign at the same weight
 * got identical share of voice.
 *
 * A booking sits at `PENDING_PAYMENT` and does nothing until it is activated —
 * `getActiveBooking` only ever looks at ACTIVE rows. Writing a booking down does
 * not hand the space over; being paid does.
 */

const PLACEMENT_LABEL: Record<string, string> = Object.fromEntries(
  AD_PLACEMENTS.map((p) => [p.name, p.label])
);

export interface BookablePlacement {
  id: string;
  name: string;
  isRentable?: boolean;
  monthlyUsd?: number | string | null;
}

export interface BookableCampaign {
  id: string;
  title: string;
}

interface BookingRow {
  id: string;
  placementId: string;
  placement: string;
  campaignId: string;
  campaign: string;
  advertiser: string | null;
  startAt: string;
  endAt: string;
  priceUsd: number;
  exclusive: boolean;
  billClicks: boolean;
  status: string;
  note: string | null;
  /** ACTIVE *and* inside its window — status alone does not mean it is running. */
  live: boolean;
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-400",
  PENDING_PAYMENT: "bg-amber-500/15 text-amber-400",
  ENDED: "bg-slate-700 text-slate-300",
  CANCELLED: "bg-red-500/15 text-red-400",
};

export function BookingsTab({
  canManage,
  placements,
  campaigns,
}: {
  canManage: boolean;
  placements: BookablePlacement[];
  campaigns: BookableCampaign[];
}) {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/ads/bookings");
      const d = await r.json();
      setRows(d.bookings ?? []);
    } catch {
      /* leave the list as it was rather than blanking it */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (b: BookingRow, status: string) => {
    const res = await fetch(`/api/admin/ads/bookings/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Couldn't update the booking");
    }
    void load();
  };

  const rentable = placements.filter((p) => p.isRentable && p.monthlyUsd != null);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-blue-500/25 bg-blue-500/10 p-3 text-sm text-blue-100/90">
        <b className="text-white">Selling a space directly.</b> Set a monthly
        price on a space under <b>Ad Spaces</b>, then book it here for a client.
        While an <b>exclusive</b> booking is active, only that campaign&apos;s ads
        run in the space — unless it has nothing to show, in which case the space
        falls back to your house ads rather than going blank.
      </div>

      {canManage && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-slate-500">
            {rentable.length === 0
              ? "No space is marked for rent yet — set a monthly price under Ad Spaces."
              : `${rentable.length} space(s) available to book.`}
          </p>
          <button
            onClick={() => setCreating(true)}
            disabled={rentable.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40"
          >
            <Plus className="w-4 h-4" /> New booking
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-500 py-6 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">No bookings yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-3.5"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {PLACEMENT_LABEL[b.placement] ?? b.placement}
                    <span className="text-slate-500"> → {b.campaign}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {b.startAt.slice(0, 10)} → {b.endAt.slice(0, 10)} ·{" "}
                    {usd(b.priceUsd)} · {b.exclusive ? "exclusive" : "shared"} ·{" "}
                    {b.billClicks ? "clicks billed" : "flat rate, clicks free"}
                    {b.advertiser ? ` · ${b.advertiser}` : ""}
                  </p>
                  {b.note && (
                    <p className="text-[11px] text-slate-600 mt-0.5">{b.note}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {b.live && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400">
                      Running now
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${STATUS_TONE[b.status] ?? "bg-slate-700 text-slate-300"}`}
                  >
                    {b.status.replace("_", " ")}
                  </span>
                  {canManage && b.status === "PENDING_PAYMENT" && (
                    <button
                      onClick={() => setStatus(b, "ACTIVE")}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                    >
                      Mark paid
                    </button>
                  )}
                  {canManage && b.status === "ACTIVE" && (
                    <button
                      onClick={() => setStatus(b, "ENDED")}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold"
                    >
                      End
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <BookingModal
          placements={rentable}
          campaigns={campaigns}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function BookingModal({
  placements,
  campaigns,
  onClose,
  onSaved,
}: {
  placements: BookablePlacement[];
  campaigns: BookableCampaign[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [placementId, setPlacementId] = useState(placements[0]?.id ?? "");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const [startAt, setStartAt] = useState(today);
  const [endAt, setEndAt] = useState(today);
  const [price, setPrice] = useState("");
  const [exclusive, setExclusive] = useState(true);
  const [billClicks, setBillClicks] = useState(false);
  const [activate, setActivate] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Prefill from the space's monthly rate — the rate card exists so nobody has
  // to remember what a space costs.
  const chosen = placements.find((p) => p.id === placementId);
  const suggested =
    chosen?.monthlyUsd == null ? "" : String(Number(chosen.monthlyUsd));

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/ads/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placementId,
          campaignId,
          // Sent as explicit UTC instants. Ad reporting is UTC-bucketed
          // throughout, and a booking whose window drifts by the admin's offset
          // would start and end on days the reports disagree about.
          startAt: `${startAt}T00:00:00.000Z`,
          endAt: `${endAt}T23:59:59.000Z`,
          priceUsd: Number(price || suggested || 0),
          exclusive,
          billClicks,
          activate,
          note: note.trim() || undefined,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error ?? "Couldn't create the booking");
        return;
      }
      toast.success("Booking created");
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm";

  return (
    <ModalShell title="New booking" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Space</label>
          <select
            value={placementId}
            onChange={(e) => setPlacementId(e.target.value)}
            className={inputCls}
          >
            {placements.map((p) => (
              <option key={p.id} value={p.id}>
                {PLACEMENT_LABEL[p.name] ?? p.name}
                {p.monthlyUsd != null ? ` — ${usd(Number(p.monthlyUsd))}/mo` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Campaign to run in it
          </label>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className={inputCls}
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">From</label>
            <input
              type="date"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">To</label>
            <input
              type="date"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Price for the period ($)
          </label>
          <input
            type="number"
            min={0}
            value={price}
            placeholder={suggested || "0"}
            onChange={(e) => setPrice(e.target.value)}
            className={inputCls}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Snapshotted on the booking — changing the rate card later never
            rewrites what was already sold.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={exclusive}
            onChange={(e) => setExclusive(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Exclusive — only this campaign runs in the space
            <span className="block text-[11px] text-slate-500">
              If it has nothing servable, the space falls back to house ads
              rather than showing nothing.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={billClicks}
            onChange={(e) => setBillClicks(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Also bill each click to the campaign budget
            <span className="block text-[11px] text-slate-500">
              Leave off for a flat-rate sponsor — they have already paid for the
              period, so billing per click charges them twice for the same
              inventory.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={activate}
            onChange={(e) => setActivate(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Already paid — activate now
            <span className="block text-[11px] text-slate-500">
              Otherwise it waits at &quot;awaiting payment&quot; and does not take
              the space.
            </span>
          </span>
        </label>

        <div>
          <label className="block text-xs text-slate-400 mb-1">
            Note (optional)
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
            placeholder="Agreed over WhatsApp, invoice to follow"
          />
        </div>

        <button
          onClick={save}
          disabled={busy || !placementId || !campaignId}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create booking"}
        </button>
      </div>
    </ModalShell>
  );
}
