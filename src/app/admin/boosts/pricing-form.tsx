"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { FieldHelp } from "@/components/admin/field-help";
import { NumberInput } from "@/components/admin/number-input";
import { Section, Toggle } from "@/components/admin/shared/controls";
import { COUNTRY_OPTIONS } from "@/lib/ad-targeting";
import {
  BOOST_EVENT_KINDS,
  BOOST_EVENT_LABEL,
  type BoostEventKind,
  type BoostPricing,
} from "@/lib/boost/pricing";

const inp =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none disabled:opacity-60";
const SHORT: Record<BoostEventKind, string> = {
  IMPRESSION: "Impr.",
  VIEW: "View",
  CLICK: "Click",
  LIKE: "Like",
  COMMENT: "Comment",
  SHARE: "Share",
};
const countryName = new Map(COUNTRY_OPTIONS.map((c) => [c.code, `${c.flag} ${c.name}`]));
const toInt = (v: string, min = 0) => Math.max(min, Math.round(Number(v) || 0));

export function BoostPricingForm({
  initial,
  canEdit,
  saved,
}: {
  initial: BoostPricing;
  canEdit: boolean;
  /** False until the first save — the form then shows the defaults. */
  saved: boolean;
}) {
  const router = useRouter();
  const [p, setP] = useState<BoostPricing>(initial);
  const [baseline, setBaseline] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [newCountry, setNewCountry] = useState("");
  const dirty = JSON.stringify(p) !== baseline || !saved;

  const setEvent = (k: BoostEventKind, patch: Partial<{ enabled: boolean; price: number }>) =>
    setP((x) => ({ ...x, events: { ...x.events, [k]: { ...x.events[k], ...patch } } }));
  const setCountryPrice = (cc: string, k: BoostEventKind, raw: string) =>
    setP((x) => {
      const row = { ...(x.countries[cc] ?? {}) };
      // Blank = use the default price for this kind.
      if (raw === "") delete row[k];
      else row[k] = toInt(raw);
      return { ...x, countries: { ...x.countries, [cc]: row } };
    });
  const removeCountry = (cc: string) =>
    setP((x) => {
      const rest = { ...x.countries };
      delete rest[cc];
      return { ...x, countries: rest };
    });
  const addCountry = () => {
    const cc = newCountry.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return toast.error("Pick a country.");
    if (p.countries[cc]) return toast.error("That country is already in the table.");
    setP((x) => ({ ...x, countries: { ...x.countries, [cc]: {} } }));
    setNewCountry("");
  };
  const available = useMemo(() => COUNTRY_OPTIONS.filter((c) => !p.countries[c.code]), [p.countries]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/boosts/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing: p }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't save");
      setP(d.pricing);
      setBaseline(JSON.stringify(d.pricing));
      toast.success("Boost pricing saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const off = !canEdit;
  return (
    <div className="max-w-4xl space-y-4">
      {!saved && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Not saved yet — these are the starting values. Nothing is charged differently until you save.
        </p>
      )}
      {!canEdit && <p className="text-xs text-slate-500">You can view the prices; changing them needs the settings.edit permission.</p>}

      <Section title="Price per event (Ad Points)">
        <p className="text-xs text-slate-500">
          Each counted event takes this many Ad Points from the boost&apos;s budget. Switched off = not counted and not
          charged. One viewer is charged once per boost for a click, like, comment or share, and at most once a day for an
          impression or a view. The boost owner&apos;s own activity is never charged.
        </p>
        <div className="space-y-2">
          {BOOST_EVENT_KINDS.map((k) => (
            <div key={k} className="grid items-center gap-2 sm:grid-cols-[1fr_9rem]">
              <Toggle
                label={BOOST_EVENT_LABEL[k]}
                checked={p.events[k].enabled}
                onChange={(v) => setEvent(k, { enabled: v })}
                disabled={off}
                tone="emerald"
              />
              <NumberInput
                min={0}
                value={p.events[k].price}
                onChange={(e) => setEvent(k, { price: toInt(e.target.value) })}
                disabled={off || !p.events[k].enabled}
                className={inp}
                aria-label={`${BOOST_EVENT_LABEL[k]} price`}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Prices by country">
        <p className="text-xs text-slate-500">
          The VIEWER&apos;s country decides the price. Leave a box blank to use the default price above for that event.
          <FieldHelp text="A viewer's country is their profile country, or the country of their IP address when the profile has none (or always the IP, when 'Match country targeting by IP only' is on). A country not in this table pays the default prices." />
        </p>
        {Object.keys(p.countries).length === 0 ? (
          <p className="text-sm text-slate-500">No country overrides — every viewer is charged the default prices.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 pr-2 font-medium">Country</th>
                  {BOOST_EVENT_KINDS.map((k) => (
                    <th key={k} className="px-1 py-1 font-medium">{SHORT[k]}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {Object.keys(p.countries)
                  .sort()
                  .map((cc) => (
                    <tr key={cc} className="border-t border-slate-800">
                      <td className="py-1.5 pr-2 text-slate-200">{countryName.get(cc) ?? cc}</td>
                      {BOOST_EVENT_KINDS.map((k) => (
                        <td key={k} className="px-1 py-1.5">
                          <NumberInput
                            min={0}
                            value={p.countries[cc][k] ?? ""}
                            placeholder={String(p.events[k].price)}
                            onChange={(e) => setCountryPrice(cc, k, e.target.value)}
                            disabled={off}
                            className={`${inp} px-2`}
                            aria-label={`${cc} ${SHORT[k]} price`}
                          />
                        </td>
                      ))}
                      <td className="pl-1">
                        <button
                          type="button"
                          onClick={() => removeCountry(cc)}
                          disabled={off}
                          aria-label={`Remove ${cc}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <select value={newCountry} onChange={(e) => setNewCountry(e.target.value)} className={`${inp} w-auto min-w-[14rem]`}>
              <option value="">Choose a country…</option>
              {available.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addCountry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" /> Add country
            </button>
          </div>
        )}
      </Section>

      <Section title="Limits">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Smallest budget (Ad Points)
              <FieldHelp text="A member cannot start a boost with less than this." />
            </label>
            <NumberInput min={1} value={p.minBudget} onChange={(e) => setP({ ...p, minBudget: toInt(e.target.value, 1) })} disabled={off} className={inp} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Longest run (days)
              <FieldHelp text="The most days a member can choose for one boost (1–365)." />
            </label>
            <NumberInput min={1} max={365} value={p.maxDays} onChange={(e) => setP({ ...p, maxDays: Math.min(365, toInt(e.target.value, 1)) })} disabled={off} className={inp} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Times one viewer sees a boost
              <FieldHelp text="How many times the feed may show the same boosted post to one person. 0 = no limit. The feed also waits 15 minutes before showing the same boost to the same person again. This replaces the old 'max times shown per user' on Feed settings → General." />
            </label>
            <NumberInput min={0} max={1000} value={p.maxPerViewer} onChange={(e) => setP({ ...p, maxPerViewer: Math.min(1000, toInt(e.target.value)) })} disabled={off} className={inp} />
          </div>
        </div>
        <Toggle
          label="Every boost waits for an admin"
          description="On: a new boost is held and waits in the Review queue. Off: it starts running the moment the member pays."
          checked={p.requireReview}
          onChange={(v) => setP({ ...p, requireReview: v })}
          disabled={off}
          tone="amber"
        />
      </Section>

      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save pricing
          </button>
        </div>
      )}
    </div>
  );
}
