"use client";

/**
 * Task audience targeting builder — country / state·division / district /
 * sub-district (upazila) + gender + age. Emits the flat arrays + age bounds
 * stored on Task and matched against the viewer's profile by
 * src/lib/task-targeting.ts. Empty everywhere = "everyone".
 *
 * Location options come from the same DB-backed hierarchy the profile
 * `LocationSelector` uses (`/api/locations/*`), so targeting values are the
 * exact string names stored on `User.{region,division,district,subDistrict}`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, MapPin, Users, Cake, Globe, Pencil } from "lucide-react";
import { GENDER_OPTIONS } from "@/lib/ad-targeting";
import {
  LEVEL_ORDER,
  LOCATION_TYPE_LABEL,
  fieldForType,
  type LocationType,
} from "@/lib/locations";
import { cn } from "@/lib/utils";

export interface TaskAudienceValue {
  countries: string[];
  genders: string[];
  minAge: number | null;
  maxAge: number | null;
  regions: string[];
  divisions: string[];
  districts: string[];
  subDistricts: string[];
  postalCodes: string[];
}

interface Props {
  value: TaskAudienceValue;
  onChange: (patch: Partial<TaskAudienceValue>) => void;
  disabled?: boolean;
}

interface CountryOption {
  id: string;
  iso2: string;
  name: string;
  flag: string | null;
  enabledLevels: string[];
}
interface LocationOption {
  id: string;
  name: string;
  type: string;
}

// Levels we target on (skip CITY / VILLAGE / SUB_DIVISION — not stored/queried).
const TARGET_LEVELS = new Set<LocationType>([
  "STATE",
  "REGION",
  "DIVISION",
  "DISTRICT",
  "SUB_DISTRICT",
]);
// Which `TaskAudienceValue` array a location field name feeds.
const FIELD_TO_ARRAY: Record<string, keyof TaskAudienceValue> = {
  region: "regions",
  division: "divisions",
  district: "districts",
  subDistrict: "subDistricts",
};

// Shared fetch caches (mirrors location-selector).
let countriesPromise: Promise<CountryOption[]> | null = null;
const childrenCache = new Map<string, Promise<LocationOption[]>>();

async function loadCountries(): Promise<CountryOption[]> {
  if (!countriesPromise) {
    countriesPromise = fetch("/api/locations/countries")
      .then((r) => (r.ok ? r.json() : { countries: [] }))
      .then((d) => (d.countries ?? []) as CountryOption[])
      .catch(() => [] as CountryOption[]);
  }
  return countriesPromise;
}
async function loadChildren(params: {
  parentId?: string;
  countryId?: string;
  type?: LocationType;
}): Promise<LocationOption[]> {
  const qs = new URLSearchParams();
  if (params.parentId) qs.set("parentId", params.parentId);
  if (params.countryId) qs.set("countryId", params.countryId);
  if (params.type) qs.set("type", params.type);
  const key = qs.toString();
  if (!key) return [];
  let cached = childrenCache.get(key);
  if (!cached) {
    cached = fetch(`/api/locations/children?${key}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => (d.items ?? []) as LocationOption[])
      .catch(() => [] as LocationOption[]);
    childrenCache.set(key, cached);
  }
  return cached;
}

const fieldCls =
  "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50";

export function TaskAudienceTargeting({ value, onChange, disabled }: Props) {
  const [countries, setCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    let cancel = false;
    loadCountries().then((list) => {
      if (!cancel) setCountries(list);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const toggleArray = (key: keyof TaskAudienceValue, item: string) => {
    const arr = (value[key] as string[]) ?? [];
    onChange({
      [key]: arr.includes(item)
        ? arr.filter((x) => x !== item)
        : [...arr, item],
    } as Partial<TaskAudienceValue>);
  };
  const removeFrom = (key: keyof TaskAudienceValue, item: string) => {
    const arr = (value[key] as string[]) ?? [];
    onChange({ [key]: arr.filter((x) => x !== item) } as Partial<TaskAudienceValue>);
  };
  const addTo = (key: keyof TaskAudienceValue, item: string) => {
    const arr = (value[key] as string[]) ?? [];
    if (!item || arr.includes(item)) return;
    onChange({ [key]: [...arr, item] } as Partial<TaskAudienceValue>);
  };

  return (
    <div className="space-y-5">
      {/* Countries */}
      <div>
        <label className="flex text-sm font-medium text-gray-300 mb-2 items-center gap-1.5">
          <Globe className="w-4 h-4 text-gray-500" /> Countries
        </label>
        {value.countries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {value.countries.map((c) => {
              const co = countries.find((x) => x.iso2 === c);
              return (
                <Chip
                  key={c}
                  label={`${co?.flag ?? "🏳️"} ${co?.name ?? c}`}
                  onRemove={() => removeFrom("countries", c)}
                  disabled={disabled}
                />
              );
            })}
          </div>
        )}
        <select
          value=""
          disabled={disabled}
          onChange={(e) => e.target.value && addTo("countries", e.target.value)}
          className={fieldCls}
        >
          <option value="">＋ Add a country…</option>
          {countries
            .filter((c) => !value.countries.includes(c.iso2))
            .map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {c.flag ?? "🏳️"} {c.name}
              </option>
            ))}
        </select>
        <p className="text-[11px] text-gray-500 mt-1">
          Leave empty for all countries. Add one to also target its states /
          districts below.
        </p>
      </div>

      {/* Location (state / division / district / sub-district) */}
      <LocationTargeting
        countries={countries}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />

      {/* Gender + Age */}
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label className="flex text-sm font-medium text-gray-300 mb-2 items-center gap-1.5">
            <Users className="w-4 h-4 text-gray-500" /> Gender
          </label>
          <div className="flex flex-wrap gap-2">
            {GENDER_OPTIONS.map((g) => {
              const on = value.genders.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleArray("genders", g)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                    on
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                  )}
                >
                  {g.charAt(0) + g.slice(1).toLowerCase()}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Empty = any gender.</p>
        </div>

        <div>
          <label className="flex text-sm font-medium text-gray-300 mb-2 items-center gap-1.5">
            <Cake className="w-4 h-4 text-gray-500" /> Age range
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={120}
              placeholder="Min"
              value={value.minAge ?? ""}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  minAge: e.target.value === "" ? null : parseInt(e.target.value) || null,
                })
              }
              className={cn(fieldCls, "w-24")}
            />
            <span className="text-gray-500 text-sm">to</span>
            <input
              type="number"
              min={0}
              max={120}
              placeholder="Max"
              value={value.maxAge ?? ""}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  maxAge: e.target.value === "" ? null : parseInt(e.target.value) || null,
                })
              }
              className={cn(fieldCls, "w-24")}
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            From the user&apos;s date of birth. Empty = any age.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Location targeting — pick a country, cascade its levels, add chips ────────
function LocationTargeting({
  countries,
  value,
  onChange,
  disabled,
}: {
  countries: CountryOption[];
  value: TaskAudienceValue;
  onChange: (patch: Partial<TaskAudienceValue>) => void;
  disabled?: boolean;
}) {
  // The country whose hierarchy we're browsing to add locations. Starts unset
  // ("None") — nothing is targeted until the admin explicitly picks a country
  // AND adds a division/district/upazila below.
  const [browseIso, setBrowseIso] = useState<string>("");

  const country = useMemo(
    () => countries.find((c) => c.iso2 === browseIso) ?? null,
    [countries, browseIso]
  );
  const levels = useMemo<LocationType[]>(() => {
    if (!country) return [];
    const set = new Set(country.enabledLevels);
    return LEVEL_ORDER.filter((t) => set.has(t) && TARGET_LEVELS.has(t));
  }, [country]);

  const removeFrom = (key: keyof TaskAudienceValue, item: string) => {
    const arr = (value[key] as string[]) ?? [];
    onChange({ [key]: arr.filter((x) => x !== item) } as Partial<TaskAudienceValue>);
  };

  // Show accumulated location chips (across all levels).
  const chipGroups: { key: keyof TaskAudienceValue; label: string }[] = [
    { key: "regions", label: "States" },
    { key: "divisions", label: "Divisions" },
    { key: "districts", label: "Districts" },
    { key: "subDistricts", label: "Upazilas" },
  ];
  const anyChips = chipGroups.some((g) => (value[g.key] as string[]).length > 0);

  return (
    <div>
      <label className="flex text-sm font-medium text-gray-300 mb-2 items-center gap-1.5">
        <MapPin className="w-4 h-4 text-gray-500" /> Location
      </label>

      {anyChips && (
        <div className="space-y-1.5 mb-3">
          {chipGroups.map((g) =>
            (value[g.key] as string[]).length ? (
              <div key={g.key} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-gray-500 w-16 shrink-0">
                  {g.label}
                </span>
                {(value[g.key] as string[]).map((v) => (
                  <Chip
                    key={v}
                    label={v}
                    onRemove={() => removeFrom(g.key, v)}
                    disabled={disabled}
                  />
                ))}
              </div>
            ) : null
          )}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950/60 p-3 space-y-3">
        <div>
          <span className="text-[11px] text-gray-500">Browse country</span>
          <select
            value={browseIso}
            disabled={disabled}
            onChange={(e) => setBrowseIso(e.target.value)}
            className={cn(fieldCls, "mt-1")}
          >
            <option value="">None — no location targeting</option>
            {countries.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {c.flag ?? "🏳️"} {c.name}
              </option>
            ))}
          </select>
        </div>

        {!browseIso ? (
          <p className="text-[11px] text-gray-500">
            Pick a country to target specific states / districts / upazilas
            (optional). Leave as <strong>None</strong> for a normal, everywhere
            task.
          </p>
        ) : levels.length === 0 ? (
          <p className="text-[11px] text-gray-500">
            No sub-national levels configured for this country — country-level
            targeting only.
          </p>
        ) : (
          <CascadeAdd
            country={country!}
            levels={levels}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        )}
      </div>
      <p className="text-[11px] text-gray-500 mt-1">
        Empty = anywhere in the targeted countries. Add a division to target all
        of it, or drill down to specific districts / upazilas.
      </p>

      {/* Postal / ZIP codes — free-text (not a hierarchy level) */}
      <div className="mt-3">
        <span className="text-[11px] text-gray-500">Postal / ZIP codes</span>
        <PostalCodeInput
          value={value.postalCodes}
          onChange={(next) => onChange({ postalCodes: next })}
          disabled={disabled}
        />
        <p className="text-[11px] text-gray-500 mt-1">
          Exact match against the user&apos;s postal code. Empty = any postal code.
        </p>
      </div>
    </div>
  );
}

// Cascading dropdowns with a per-level "Add" button that appends the selected
// option's name into the matching TaskAudienceValue array.
function CascadeAdd({
  country,
  levels,
  value,
  onChange,
  disabled,
}: {
  country: CountryOption;
  levels: LocationType[];
  value: TaskAudienceValue;
  onChange: (patch: Partial<TaskAudienceValue>) => void;
  disabled?: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});
  const [optionsByLevel, setOptionsByLevel] = useState<Record<string, LocationOption[]>>({});
  // Free-text override per level — used when a level has no seeded options (or the
  // admin chooses to type a custom value).
  const [customMode, setCustomMode] = useState<Record<string, boolean>>({});
  const [customText, setCustomText] = useState<Record<string, string>>({});

  // Reset on country change.
  const countryIdRef = useRef(country.id);
  useEffect(() => {
    if (countryIdRef.current !== country.id) {
      countryIdRef.current = country.id;
      setSelectedIds({});
      setOptionsByLevel({});
      setCustomMode({});
      setCustomText({});
    }
  }, [country.id]);

  // Top level options.
  useEffect(() => {
    let cancel = false;
    const top = levels[0];
    if (!top) return;
    loadChildren({ countryId: country.id, type: top }).then((items) => {
      if (!cancel) setOptionsByLevel((p) => ({ ...p, [top]: items }));
    });
    return () => {
      cancel = true;
    };
  }, [country.id, levels]);

  // Child levels fetch when their parent is selected. `level in optionsByLevel`
  // (not truthiness) is the "already loaded" guard so an empty result `[]` is
  // treated as loaded, not re-fetched forever.
  useEffect(() => {
    let cancel = false;
    (async () => {
      for (let i = 1; i < levels.length; i++) {
        const level = levels[i];
        const parentId = selectedIds[levels[i - 1]];
        if (!parentId) break; // downstream already cleared on parent change
        if (level in optionsByLevel) continue;
        const items = await loadChildren({ parentId });
        if (cancel) return;
        setOptionsByLevel((p) => ({ ...p, [level]: items }));
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, levels]);

  // Clear a level's selection + all downstream state (ids, options, custom
  // input) so switching a parent re-fetches its children.
  const clearDownstream = (fromIdx: number, patchSelected: Record<string, string>) => {
    setSelectedIds((prev) => {
      const next = { ...prev, ...patchSelected };
      for (let j = fromIdx; j < levels.length; j++) delete next[levels[j]];
      return next;
    });
    setOptionsByLevel((prev) => {
      const next = { ...prev };
      for (let j = fromIdx; j < levels.length; j++) delete next[levels[j]];
      return next;
    });
    setCustomMode((prev) => {
      const next = { ...prev };
      for (let j = fromIdx; j < levels.length; j++) delete next[levels[j]];
      return next;
    });
    setCustomText((prev) => {
      const next = { ...prev };
      for (let j = fromIdx; j < levels.length; j++) delete next[levels[j]];
      return next;
    });
  };

  const pushValue = (level: LocationType, name: string) => {
    const field = fieldForType(level);
    if (!field) return;
    const arrKey = FIELD_TO_ARRAY[field];
    if (!arrKey) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const arr = (value[arrKey] as string[]) ?? [];
    if (!arr.includes(trimmed)) {
      onChange({ [arrKey]: [...arr, trimmed] } as Partial<TaskAudienceValue>);
    }
  };

  const addSelected = (level: LocationType) => {
    const opt = (optionsByLevel[level] ?? []).find(
      (o) => o.id === selectedIds[level]
    );
    if (opt) pushValue(level, opt.name);
  };
  const addTyped = (level: LocationType) => {
    pushValue(level, customText[level] ?? "");
    setCustomText((p) => ({ ...p, [level]: "" }));
  };

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {levels.map((level, idx) => {
        const options = optionsByLevel[level] ?? [];
        const parentSelected = idx === 0 ? true : !!selectedIds[levels[idx - 1]];
        const loaded = level in optionsByLevel;
        const isLoading = parentSelected && !loaded;
        const showText =
          customMode[level] === true ||
          (parentSelected && loaded && options.length === 0);
        const label = LOCATION_TYPE_LABEL[level];

        return (
          <div key={level}>
            <span className="text-[11px] text-gray-500">{label}</span>

            {showText ? (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="text"
                  value={customText[level] ?? ""}
                  disabled={disabled || !parentSelected}
                  placeholder={
                    parentSelected ? `Type a ${label}` : "Select parent first"
                  }
                  onChange={(e) =>
                    setCustomText((p) => ({ ...p, [level]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTyped(level);
                    }
                  }}
                  className={fieldCls}
                />
                <button
                  type="button"
                  disabled={disabled || !(customText[level] ?? "").trim()}
                  onClick={() => addTyped(level)}
                  title={`Add this ${label}`}
                  className="shrink-0 p-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                </button>
                {options.length > 0 && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setCustomMode((p) => ({ ...p, [level]: false }))
                    }
                    title="Use the list instead"
                    className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1">
                <select
                  value={selectedIds[level] ?? ""}
                  disabled={disabled || !parentSelected || isLoading}
                  onChange={(e) => clearDownstream(idx + 1, { [level]: e.target.value })}
                  className={fieldCls}
                >
                  <option value="">
                    {!parentSelected
                      ? "Select parent first"
                      : isLoading
                        ? "Loading…"
                        : "Select"}
                  </option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={disabled || !selectedIds[level]}
                  onClick={() => addSelected(level)}
                  title={`Add this ${label}`}
                  className="shrink-0 p-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                </button>
                {parentSelected && !isLoading && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setCustomMode((p) => ({ ...p, [level]: true }))}
                    title="Type a custom value"
                    className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-white"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Free-text multi-add for postal / ZIP codes (type a code, Enter or ＋ to add).
function PostalCodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const code = text.trim();
    if (!code || value.includes(code)) {
      setText("");
      return;
    }
    onChange([...value, code]);
    setText("");
  };
  return (
    <div className="mt-1">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((c) => (
            <Chip
              key={c}
              label={c}
              onRemove={() => onChange(value.filter((x) => x !== c))}
              disabled={disabled}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={text}
          disabled={disabled}
          placeholder="e.g. 1704"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className={fieldCls}
        />
        <button
          type="button"
          disabled={disabled || !text.trim()}
          onClick={add}
          title="Add postal code"
          className="shrink-0 p-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Chip({
  label,
  onRemove,
  disabled,
}: {
  label: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-500/15 border border-indigo-500/25 text-xs text-indigo-200">
      {label}
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="text-indigo-300/70 hover:text-white"
          aria-label={`Remove ${label}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
