"use client";

/**
 * Sub-country geo targeting — state/division → district → upazila, plus postal
 * codes. Options come from the DB-backed location hierarchy (`/api/locations/*`),
 * so the values stored are the exact strings held on
 * `User.{region,division,district,subDistrict,postalCode}` and both the task
 * matcher and `audienceWhere()` compare against them directly.
 *
 * Extracted from the task audience builder so ads target with the same
 * precision as tasks and push segments — ad targeting used to stop at
 * country + free-text city.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, MapPin, Pencil } from "lucide-react";
import {
  LEVEL_ORDER,
  LOCATION_TYPE_LABEL,
  fieldForType,
  type LocationType,
} from "@/lib/locations";
import { cn } from "@/lib/utils";

export interface GeoTargetingValue {
  regions?: string[];
  divisions?: string[];
  districts?: string[];
  subDistricts?: string[];
  postalCodes?: string[];
}

export interface CountryOption {
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

const FIELD_TO_ARRAY: Record<string, keyof GeoTargetingValue> = {
  region: "regions",
  division: "divisions",
  district: "districts",
  subDistrict: "subDistricts",
};

// Shared fetch caches (mirrors location-selector).
let countriesPromise: Promise<CountryOption[]> | null = null;
const childrenCache = new Map<string, Promise<LocationOption[]>>();

export async function loadCountryOptions(): Promise<CountryOption[]> {
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

export function Chip({
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

/** Pick a country, cascade its levels, add chips. */
export function AudienceGeoPicker({
  value,
  onChange,
  disabled,
  countries: countriesProp,
  hint,
}: {
  value: GeoTargetingValue;
  onChange: (patch: GeoTargetingValue) => void;
  disabled?: boolean;
  /** Pass a preloaded list to avoid a second fetch; otherwise loaded here. */
  countries?: CountryOption[];
  hint?: string;
}) {
  const [loaded, setLoaded] = useState<CountryOption[]>([]);
  const countries = countriesProp ?? loaded;

  useEffect(() => {
    if (countriesProp) return;
    let cancel = false;
    loadCountryOptions().then((list) => {
      if (!cancel) setLoaded(list);
    });
    return () => {
      cancel = true;
    };
  }, [countriesProp]);

  // The country whose hierarchy we're browsing. Nothing is targeted until a
  // division/district/upazila is explicitly added.
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

  const removeFrom = (key: keyof GeoTargetingValue, item: string) => {
    const arr = value[key] ?? [];
    onChange({ [key]: arr.filter((x) => x !== item) } as GeoTargetingValue);
  };

  const chipGroups: { key: keyof GeoTargetingValue; label: string }[] = [
    { key: "regions", label: "States" },
    { key: "divisions", label: "Divisions" },
    { key: "districts", label: "Districts" },
    { key: "subDistricts", label: "Upazilas" },
  ];
  const anyChips = chipGroups.some((g) => (value[g.key] ?? []).length > 0);

  return (
    <div>
      <label className="flex text-sm font-medium text-gray-300 mb-2 items-center gap-1.5">
        <MapPin className="w-4 h-4 text-gray-500" /> Location
      </label>

      {anyChips && (
        <div className="space-y-1.5 mb-3">
          {chipGroups.map((g) =>
            (value[g.key] ?? []).length ? (
              <div key={g.key} className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-gray-500 w-16 shrink-0">
                  {g.label}
                </span>
                {(value[g.key] ?? []).map((v) => (
                  <Chip key={v} label={v} onRemove={() => removeFrom(g.key, v)} disabled={disabled} />
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
            Pick a country to target specific states / districts / upazilas (optional). Leave as{" "}
            <strong>None</strong> to reach everywhere.
          </p>
        ) : levels.length === 0 ? (
          <p className="text-[11px] text-gray-500">
            No sub-national levels configured for this country — country-level targeting only.
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
        {hint ??
          "Empty = anywhere in the targeted countries. Add a division to target all of it, or drill down to specific districts / upazilas."}
      </p>

      {/* Postal / ZIP codes — free-text (not a hierarchy level) */}
      <div className="mt-3">
        <span className="text-[11px] text-gray-500">Postal / ZIP codes</span>
        <PostalCodeInput
          value={value.postalCodes ?? []}
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
// option's name into the matching array.
function CascadeAdd({
  country,
  levels,
  value,
  onChange,
  disabled,
}: {
  country: CountryOption;
  levels: LocationType[];
  value: GeoTargetingValue;
  onChange: (patch: GeoTargetingValue) => void;
  disabled?: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});
  const [optionsByLevel, setOptionsByLevel] = useState<Record<string, LocationOption[]>>({});
  // Free-text override per level — used when a level has no seeded options.
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
    const arr = value[arrKey] ?? [];
    if (!arr.includes(trimmed)) {
      onChange({ [arrKey]: [...arr, trimmed] } as GeoTargetingValue);
    }
  };

  const addSelected = (level: LocationType) => {
    const opt = (optionsByLevel[level] ?? []).find((o) => o.id === selectedIds[level]);
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
        const isLoaded = level in optionsByLevel;
        const isLoading = parentSelected && !isLoaded;
        const showText =
          customMode[level] === true || (parentSelected && isLoaded && options.length === 0);
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
                  placeholder={parentSelected ? `Type a ${label}` : "Select parent first"}
                  onChange={(e) => setCustomText((p) => ({ ...p, [level]: e.target.value }))}
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
                    onClick={() => setCustomMode((p) => ({ ...p, [level]: false }))}
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
                    {!parentSelected ? "Select parent first" : isLoading ? "Loading…" : "Select"}
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
