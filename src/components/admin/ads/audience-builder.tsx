"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Users, X, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COUNTRY_OPTIONS,
  LANGUAGE_OPTIONS,
  GENDER_OPTIONS,
  KYC_OPTIONS,
  INTEREST_OPTIONS,
  type AdTargeting,
} from "@/lib/ad-targeting";
import { useCountries } from "@/lib/use-countries";
import { AudienceGeoPicker } from "@/components/shared/audience-geo-picker";

type OptCount = { value: string; label: string; count?: number };

/**
 * Facebook-style audience builder: every dimension a dropdown, interests are
 * searchable chips, and a live reach estimate ("N of T users") from the real
 * platform user base. Controlled — parent owns an `AdTargeting` object.
 */
export function AudienceBuilder({
  value,
  onChange,
  className,
}: {
  value: AdTargeting;
  onChange: (next: AdTargeting) => void;
  className?: string;
}) {
  const [reach, setReach] = useState<{ count: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [countryCounts, setCountryCounts] = useState<Record<string, number>>({});
  const [pkgOptions, setPkgOptions] = useState<OptCount[]>([]);

  // Debounced reach + option-list fetch whenever targeting changes.
  const valueKey = JSON.stringify(value);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      fetch("/api/ads/audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targeting: value }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d) return;
          setReach({ count: d.count ?? 0, total: d.total ?? 0 });
          const cc: Record<string, number> = {};
          for (const c of d.countries ?? []) cc[c.code] = c.count;
          setCountryCounts(cc);
          setPkgOptions(
            (d.packages ?? []).map((p: { slug: string; name: string; count: number }) => ({
              value: p.slug,
              label: p.name,
              count: p.count,
            }))
          );
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [valueKey, value]);

  const set = (patch: Partial<AdTargeting>) => onChange({ ...value, ...patch });
  const num = (v: number | undefined) => (v ? String(v) : "");
  const toNum = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  // Canonical country list from the Country DB (falls back to the built-in list
  // offline). Codes are ISO2 and match User.country — one source of truth.
  const dbCountries = useCountries(
    COUNTRY_OPTIONS.map((c) => ({ code: c.code, name: c.name, flag: c.flag }))
  );
  const countryOpts: OptCount[] = useMemo(
    () =>
      dbCountries.map((c) => ({
        value: c.code,
        label: `${c.flag ?? "🏳️"} ${c.name}`,
        count: countryCounts[c.code],
      })),
    [dbCountries, countryCounts]
  );
  const langOpts: OptCount[] = LANGUAGE_OPTIONS.map((l) => ({ value: l.code, label: l.label }));
  const genderOpts: OptCount[] = GENDER_OPTIONS.map((g) => ({
    value: g,
    label: g.charAt(0) + g.slice(1).toLowerCase(),
  }));
  const kycOpts: OptCount[] = KYC_OPTIONS.map((k) => ({ value: k, label: k.replace(/_/g, " ") }));

  const pct = reach && reach.total > 0 ? Math.min(100, (reach.count / reach.total) * 100) : 0;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Live reach panel */}
      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-sky-400" />
          <span className="text-xs uppercase tracking-wider font-bold text-sky-300">
            Estimated audience
          </span>
          {loading && <span className="text-[10px] text-slate-400">updating…</span>}
        </div>
        <p className="text-2xl font-extrabold text-white tabular-nums mt-1">
          {reach ? reach.count.toLocaleString() : "—"}
          <span className="text-sm font-medium text-slate-400">
            {" "}
            / {reach ? reach.total.toLocaleString() : "—"} active users
          </span>
        </p>
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1.5">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          Live count from real profiles. New users who match are shown automatically.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MultiSelect
          label="Countries"
          options={countryOpts}
          selected={value.countries ?? []}
          onChange={(v) => set({ countries: v })}
          searchable
        />
        <MultiSelect
          label="Packages"
          options={pkgOptions}
          selected={value.packages ?? []}
          onChange={(v) => set({ packages: v })}
        />
        <MultiSelect
          label="Languages"
          options={langOpts}
          selected={value.languages ?? []}
          onChange={(v) => set({ languages: v })}
        />
        <MultiSelect
          label="Gender"
          options={genderOpts}
          selected={value.genders ?? []}
          onChange={(v) => set({ genders: v })}
        />
        <MultiSelect
          label="KYC status"
          options={kycOpts}
          selected={value.kycStatuses ?? []}
          onChange={(v) => set({ kycStatuses: v })}
        />
        <InterestSelect
          selected={value.tags ?? []}
          onChange={(v) => set({ tags: v })}
        />
      </div>

      <CityChips cities={value.cities ?? []} onChange={(v) => set({ cities: v })} />

      {/* Sub-country geo — the same DB-backed cascade tasks and push segments
          use. Ad targeting used to stop at country + free-text city. */}
      <AudienceGeoPicker
        value={{
          regions: value.regions,
          divisions: value.divisions,
          districts: value.districts,
          subDistricts: value.subDistricts,
          postalCodes: value.postalCodes,
        }}
        onChange={(patch) => set(patch as Partial<AdTargeting>)}
        hint="Optional. Empty = anywhere in the selected countries."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <NumField label="Min age" value={num(value.minAge)} onChange={(s) => set({ minAge: toNum(s) })} />
        <NumField label="Max age" value={num(value.maxAge)} onChange={(s) => set({ maxAge: toNum(s) })} />
        <NumField label="Min level" value={num(value.minLevel)} onChange={(s) => set({ minLevel: toNum(s) })} />
        <NumField label="Max level" value={num(value.maxLevel)} onChange={(s) => set({ maxLevel: toNum(s) })} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumField
          label="Min account age (days)"
          value={num(value.minAccountAgeDays)}
          onChange={(s) => set({ minAccountAgeDays: toNum(s) })}
        />
        <NumField
          label="Active within (days)"
          value={num(value.activeWithinDays)}
          onChange={(s) => set({ activeWithinDays: toNum(s) })}
        />
      </div>

      <button
        type="button"
        onClick={() => set({ verifiedOnly: !value.verifiedOnly })}
        className={cn(
          "px-3 py-1.5 rounded-lg text-xs font-semibold border",
          value.verifiedOnly
            ? "bg-sky-600 text-white border-sky-500"
            : "bg-slate-800 text-slate-300 border-slate-700"
        )}
      >
        ✓ Verified users only
      </button>
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

const fieldCls =
  "w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500";

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
      <input type="number" min={0} value={value} onChange={(e) => onChange(e.target.value)} placeholder="—" className={fieldCls} />
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable,
}: {
  label: string;
  options: OptCount[];
  selected: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = searchable && q
    ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="relative">
      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(fieldCls, "flex items-center justify-between text-left")}
      >
        <span className={cn("truncate", selected.length ? "text-white" : "text-slate-500")}>
          {selected.length ? `${selected.length} selected` : "Any"}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-30" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl p-1.5">
            {searchable && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 mb-1 rounded bg-slate-800">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  className="bg-transparent text-white text-xs w-full focus:outline-none"
                />
              </div>
            )}
            {filtered.length === 0 && <p className="text-xs text-slate-500 px-2 py-2">No matches.</p>}
            {filtered.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-slate-800"
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                      on ? "bg-blue-600 border-blue-600" : "border-slate-600"
                    )}
                  >
                    {on && <Check className="w-3 h-3 text-white" />}
                  </span>
                  <span className="text-xs text-white flex-1 truncate">{o.label}</span>
                  {o.count !== undefined && (
                    <span className="text-[10px] text-slate-500 tabular-nums">{o.count.toLocaleString()}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function InterestSelect({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const opts: OptCount[] = INTEREST_OPTIONS.map((i) => ({
    value: i.id,
    label: `${i.emoji} ${i.label}`,
  }));
  return (
    <MultiSelect label="Interests" options={opts} selected={selected} onChange={onChange} searchable />
  );
}

function CityChips({ cities, onChange }: { cities: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const add = () => {
    const v = draft.trim();
    if (v && !cities.some((c) => c.toLowerCase() === v.toLowerCase())) onChange([...cities, v]);
    setDraft("");
  };
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1">Cities</label>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {cities.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-white text-xs">
            {c}
            <button type="button" onClick={() => onChange(cities.filter((x) => x !== c))}>
              <X className="w-3 h-3 text-slate-400 hover:text-white" />
            </button>
          </span>
        ))}
      </div>
      <input
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Type a city + Enter"
        className={fieldCls}
      />
    </div>
  );
}
