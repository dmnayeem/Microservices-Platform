"use client";

/**
 * Reusable cascading address selector.
 *
 * Behavior:
 *  • Loads /api/locations/countries on mount (one-shot, cached client-side).
 *  • Renders the Country dropdown first.
 *  • For the chosen country, reads `enabledLevels` and renders only those
 *    intermediate dropdowns (in fixed top→bottom order). Levels not in
 *    `enabledLevels` collapse to free-text inputs.
 *  • Each cascading dropdown lazily fetches its options when its parent has
 *    a value.
 *  • If the API returns an empty list for an enabled level, that field
 *    falls back to a free-text input ("No options yet — type custom").
 *  • Each dropdown also has a "Type custom" toggle so admin/user can override
 *    even when DB options exist.
 *  • After the deepest dropdown is selected, the component asks
 *    /api/locations/postal-code?locationId=… and auto-fills the postal-code
 *    field if a value comes back.
 *
 * Output: the component never sends location ids to the parent — only the
 * resolved string names — so the User schema's flat string fields stay
 * unchanged.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Globe, MapPin, Pencil, Search, X as XIcon } from "lucide-react";
import {
  LEVEL_ORDER,
  LOCATION_TYPE_LABEL,
  fieldForType,
  type LocationType,
} from "@/lib/locations";
import { cn } from "@/lib/utils";

export interface LocationValue {
  country?: string | null;
  region?: string | null;
  division?: string | null;
  subDivision?: string | null;
  district?: string | null;
  subDistrict?: string | null;
  city?: string | null;
  village?: string | null;
  street?: string | null;
  postalCode?: string | null;
}

interface Props {
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
  disabled?: boolean;
}

interface CountryOption {
  id: string;
  iso2: string;
  name: string;
  flag: string | null;
  phoneCode: string | null;
  enabledLevels: string[];
}

interface LocationOption {
  id: string;
  name: string;
  type: string;
  postalCode: string | null;
}

// Module-level cache so multiple LocationSelector instances share fetch state.
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

export function LocationSelector({ value, onChange, disabled }: Props) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    loadCountries()
      .then((list) => {
        if (!cancel) setCountries(list);
      })
      .finally(() => {
        if (!cancel) setCountriesLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  // Find the country record for the currently chosen country (by iso2)
  const country = useMemo(
    () => countries.find((c) => c.iso2 === value.country) ?? null,
    [countries, value.country]
  );

  // The cascading levels this country wants to render, in order.
  const enabledLevels = useMemo<LocationType[]>(() => {
    if (!country) return [];
    const set = new Set(country.enabledLevels);
    return LEVEL_ORDER.filter((t) => set.has(t));
  }, [country]);

  return (
    <div className="space-y-4">
      {/* Country */}
      <Field
        label="Country"
        icon={<Globe className="w-3.5 h-3.5" />}
        required
      >
        <CountryCombobox
          countries={countries}
          loading={countriesLoading}
          disabled={disabled}
          value={value.country ?? ""}
          onChange={(iso2) => {
            // Clear all downstream values when country changes
            onChange({
              country: iso2 || null,
              region: null,
              division: null,
              subDivision: null,
              district: null,
              subDistrict: null,
              city: null,
              village: null,
              postalCode: null,
            });
          }}
        />
      </Field>

      {/* Cascading levels — only render after country is selected */}
      {country && enabledLevels.length > 0 && (
        <CascadingLevels
          country={country}
          enabledLevels={enabledLevels}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      )}

      {/* If country chosen but no levels are enabled, fall back to plain
          text inputs for the most-commonly-needed fields. */}
      {country && enabledLevels.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-3 space-y-3">
          <p className="text-[11px] text-gray-500 inline-flex items-center gap-1.5">
            <MapPin className="w-3 h-3" />
            No location options for {country.name} yet — enter manually.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FreeText
              label="State / Region"
              value={value.region ?? ""}
              onChange={(v) => onChange({ region: v || null })}
              disabled={disabled}
            />
            <FreeText
              label="City"
              value={value.city ?? ""}
              onChange={(v) => onChange({ city: v || null })}
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {/* Always-on free-text fields below the cascade */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FreeText
          label="Street"
          value={value.street ?? ""}
          onChange={(v) => onChange({ street: v || null })}
          disabled={disabled}
        />
        <FreeText
          label="Village / Area"
          value={value.village ?? ""}
          onChange={(v) => onChange({ village: v || null })}
          disabled={disabled}
        />
        <FreeText
          label="Postal Code"
          value={value.postalCode ?? ""}
          onChange={(v) => onChange({ postalCode: v || null })}
          disabled={disabled}
          hint="Auto-filled from city when available"
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Cascading levels — internal component; renders a chain of dropdowns and
// tracks the locationId of each selected level so the next level can fetch.
// ────────────────────────────────────────────────────────────────────────────

function CascadingLevels({
  country,
  enabledLevels,
  value,
  onChange,
  disabled,
}: {
  country: CountryOption;
  enabledLevels: LocationType[];
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
  disabled?: boolean;
}) {
  // selectedIds[level] = the chosen Location id for that level.
  // Used to drive the next level's fetch and the postal-code lookup.
  const [selectedIds, setSelectedIds] = useState<Record<string, string | null>>({});
  const [optionsByLevel, setOptionsByLevel] = useState<Record<string, LocationOption[]>>({});
  const [loadingLevel, setLoadingLevel] = useState<LocationType | null>(null);
  // Track which fields the user has explicitly switched to "type custom" mode
  const [customMode, setCustomMode] = useState<Record<string, boolean>>({});

  // When country changes, reset everything
  const countryIdRef = useRef(country.id);
  useEffect(() => {
    if (countryIdRef.current !== country.id) {
      countryIdRef.current = country.id;
      setSelectedIds({});
      setOptionsByLevel({});
      setCustomMode({});
    }
  }, [country.id]);

  // Fetch top level options on country change
  useEffect(() => {
    let cancel = false;
    const top = enabledLevels[0];
    if (!top) return;
    setLoadingLevel(top);
    loadChildren({ countryId: country.id, type: top })
      .then((items) => {
        if (cancel) return;
        setOptionsByLevel((p) => ({ ...p, [top]: items }));
      })
      .finally(() => {
        if (!cancel) setLoadingLevel(null);
      });
    return () => {
      cancel = true;
    };
  }, [country.id, enabledLevels]);

  // For levels below the top, fetch when their parent has a selected id
  useEffect(() => {
    let cancel = false;
    (async () => {
      for (let i = 1; i < enabledLevels.length; i++) {
        const level = enabledLevels[i];
        const parentLevel = enabledLevels[i - 1];
        const parentId = selectedIds[parentLevel];
        if (!parentId) {
          // Drop options below this level
          setOptionsByLevel((p) => {
            const next = { ...p };
            for (let j = i; j < enabledLevels.length; j++) delete next[enabledLevels[j]];
            return next;
          });
          break;
        }
        if (optionsByLevel[level]) continue; // already cached
        setLoadingLevel(level);
        const items = await loadChildren({ parentId });
        if (cancel) return;
        setOptionsByLevel((p) => ({ ...p, [level]: items }));
        setLoadingLevel(null);
      }
    })();
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, enabledLevels]);

  // Postal-code autofill — when the user picks the deepest selected level,
  // walk up via the API to find the closest ancestor with a postalCode.
  const fetchPostal = useCallback(
    async (locationId: string) => {
      try {
        const r = await fetch(
          `/api/locations/postal-code?locationId=${encodeURIComponent(locationId)}`
        );
        if (!r.ok) return;
        const d = (await r.json()) as { postalCode: string | null };
        if (d.postalCode && !value.postalCode) {
          onChange({ postalCode: d.postalCode });
        }
      } catch {
        // ignore
      }
    },
    [onChange, value.postalCode]
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {enabledLevels.map((level, idx) => {
        const field = fieldForType(level);
        if (!field) return null;
        const fieldKey = field as keyof LocationValue;
        const options = optionsByLevel[level] ?? [];
        const parentLevel = idx > 0 ? enabledLevels[idx - 1] : null;
        const parentSelected = parentLevel ? !!selectedIds[parentLevel] : true;
        const isLoading = loadingLevel === level;
        const dropdownEnabled = parentSelected && options.length > 0;
        const inCustomMode = customMode[level] === true;
        const showAsText = inCustomMode || (parentSelected && !isLoading && options.length === 0);

        const label = LOCATION_TYPE_LABEL[level];

        if (showAsText) {
          return (
            <div key={level}>
              <Field
                label={label}
                hint={
                  options.length === 0
                    ? "No options yet — type your own"
                    : "Custom value"
                }
              >
                <div className="relative">
                  <input
                    type="text"
                    value={(value[fieldKey] as string) ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      onChange({ [fieldKey]: v || null });
                      // clear downstream fields
                      const nextSelected = { ...selectedIds };
                      delete nextSelected[level];
                      for (let j = idx + 1; j < enabledLevels.length; j++) {
                        const lv = enabledLevels[j];
                        const f = fieldForType(lv);
                        delete nextSelected[lv];
                        if (f) onChange({ [f]: null });
                      }
                      setSelectedIds(nextSelected);
                    }}
                    placeholder={label}
                    disabled={disabled}
                    className={fieldCls}
                  />
                  {options.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomMode((p) => ({ ...p, [level]: false }));
                        onChange({ [fieldKey]: null });
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white"
                      title="Use dropdown"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </Field>
            </div>
          );
        }

        return (
          <div key={level}>
            <Field label={label}>
              <div className="relative">
                <select
                  value={selectedIds[level] ?? ""}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const opt = id ? options.find((o) => o.id === id) : null;
                    // Update id selection for cascading
                    const nextSelected: Record<string, string | null> = {
                      ...selectedIds,
                      [level]: id,
                    };
                    // Clear downstream selections (both ids and value strings)
                    for (let j = idx + 1; j < enabledLevels.length; j++) {
                      const lv = enabledLevels[j];
                      delete nextSelected[lv];
                      const f = fieldForType(lv);
                      if (f) onChange({ [f]: null });
                    }
                    setSelectedIds(nextSelected);
                    onChange({ [fieldKey]: opt ? opt.name : null });
                    if (id) {
                      // Auto-fill postal code from this selection (server walks up).
                      fetchPostal(id);
                    }
                  }}
                  disabled={disabled || !parentSelected || isLoading}
                  className={fieldCls}
                >
                  <option value="">
                    {!parentSelected
                      ? `Select ${
                          parentLevel
                            ? LOCATION_TYPE_LABEL[parentLevel]
                            : "country"
                        } first`
                      : isLoading
                      ? "Loading…"
                      : "Select"}
                  </option>
                  {dropdownEnabled &&
                    options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </select>
                {dropdownEnabled && (
                  <button
                    type="button"
                    onClick={() =>
                      setCustomMode((p) => ({ ...p, [level]: true }))
                    }
                    title="Type custom value"
                    className="absolute right-7 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            </Field>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tiny presentational helpers
// ────────────────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  icon,
  required,
  children,
}: {
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={cn("block text-xs font-medium text-slate-400 mb-1.5")}>
        {icon && <span className="inline-flex items-center mr-1">{icon}</span>}
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
        {hint && (
          <span className="text-slate-600 ml-2 font-normal">· {hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}

function FreeText({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={fieldCls}
      />
    </Field>
  );
}

const fieldCls =
  "w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50";

// ────────────────────────────────────────────────────────────────────────────
// Country combobox — searchable input with filtered dropdown.
// Replaces the native <select> so users can type "uni" and see United States,
// United Kingdom, UAE, etc.
// ────────────────────────────────────────────────────────────────────────────

function CountryCombobox({
  countries,
  loading,
  disabled,
  value,
  onChange,
}: {
  countries: CountryOption[];
  loading: boolean;
  disabled?: boolean;
  /** iso2 of the currently selected country, or "" */
  value: string;
  onChange: (iso2: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(
    () => countries.find((c) => c.iso2 === value) ?? null,
    [countries, value]
  );

  // Filter by query — match name (contains) or iso2 (starts-with)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso2.toLowerCase().startsWith(q) ||
        (c.phoneCode ?? "").toLowerCase().includes(q)
    );
  }, [countries, query]);

  // Keep activeIndex in range when the filter changes — done wherever `query`
  // is set, not in an effect. As an effect it ran a render late, so the list
  // briefly highlighted a row that the new filter no longer contained.
  const changeQuery = (v: string) => {
    setQuery(v);
    setActiveIndex(0);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        changeQuery("");
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Scroll active option into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-index="${activeIndex}"]`
    ) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const pick = (iso2: string) => {
    onChange(iso2);
    setOpen(false);
    changeQuery("");
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* Display button when closed; turns into search input when open */}
      {!open ? (
        <button
          type="button"
          onClick={() => {
            if (disabled || loading) return;
            setOpen(true);
            // Focus the input on next tick after the input renders
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          disabled={disabled || loading}
          className={cn(
            fieldCls,
            "flex items-center gap-2 text-left disabled:cursor-not-allowed"
          )}
        >
          {loading ? (
            <span className="text-slate-500">Loading…</span>
          ) : selected ? (
            <>
              <span className="text-base shrink-0">{selected.flag ?? "🏳️"}</span>
              <span className="flex-1 truncate">{selected.name}</span>
              {selected.phoneCode && (
                <span className="text-slate-500 text-xs">
                  {selected.phoneCode}
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-500 flex-1">Select country</span>
          )}
          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
        </button>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            placeholder="Type to search 196 countries…"
            className={cn(fieldCls, "pl-9 pr-9")}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const opt = filtered[activeIndex];
                if (opt) pick(opt.iso2);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                changeQuery("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              changeQuery("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-white"
            tabIndex={-1}
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Dropdown list */}
      {open && (
        <div
          ref={listRef}
          className="absolute z-30 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-500">
              No countries match &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((c, idx) => {
              const isSelected = c.iso2 === value;
              const isActive = idx === activeIndex;
              return (
                <button
                  key={c.iso2}
                  type="button"
                  data-index={idx}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => pick(c.iso2)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-blue-500/15 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  <span className="text-base shrink-0">{c.flag ?? "🏳️"}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono shrink-0">
                    {c.iso2}
                  </span>
                  {c.phoneCode && (
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {c.phoneCode}
                    </span>
                  )}
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

