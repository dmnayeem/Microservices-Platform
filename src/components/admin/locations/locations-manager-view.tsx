"use client";

import { confirmDialog } from "@/lib/confirm";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Globe,
  Loader2,
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Check,
  X as XIcon,
  Hash,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  ALL_LOCATION_TYPES,
  LOCATION_TYPE_LABEL,
  LEVEL_ORDER,
  type LocationType,
} from "@/lib/locations";

interface CountryRow {
  id: string;
  iso2: string;
  name: string;
  flag: string | null;
  phoneCode: string | null;
  enabledLevels: string[];
}

interface LocationRow {
  id: string;
  name: string;
  type: string;
  postalCode: string | null;
}

interface Props {
  canEdit: boolean;
}

export function LocationsManagerView({ canEdit }: Props) {
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState<CountryRow | null>(null);
  const [search, setSearch] = useState("");

  const loadCountries = useCallback(async () => {
    setLoadingCountries(true);
    try {
      const r = await fetch("/api/locations/countries");
      const d = await r.json();
      setCountries(d.countries ?? []);
    } finally {
      setLoadingCountries(false);
    }
  }, []);

  useEffect(() => {
    loadCountries();
  }, [loadCountries]);

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return countries;
    const q = search.toLowerCase();
    return countries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.iso2.toLowerCase() === q
    );
  }, [countries, search]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold text-white inline-flex items-center gap-2">
          <Globe className="w-6 h-6 text-indigo-400" />
          Locations
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage cascading address dropdowns. Pick a country, then add /
          rename / disable States, Divisions, Districts, Cities. Changes go
          live immediately for both admin Create User and user Profile flows.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-6">
        {/* Country list */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="p-3 border-b border-gray-800">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country…"
              className="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-800">
            {loadingCountries && (
              <div className="text-center py-6 text-xs text-gray-500">
                Loading…
              </div>
            )}
            {!loadingCountries && filteredCountries.length === 0 && (
              <div className="text-center py-6 text-xs text-gray-500">
                No matches
              </div>
            )}
            {filteredCountries.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCountry(c)}
                className={cn(
                  "w-full flex items-center gap-2 p-3 text-left transition-colors",
                  selectedCountry?.id === c.id
                    ? "bg-indigo-500/10 border-l-2 border-indigo-500"
                    : "hover:bg-gray-800"
                )}
              >
                <span className="text-base">{c.flag ?? "🏳️"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{c.name}</p>
                  <p className="text-[10px] text-gray-500 font-mono">
                    {c.iso2}
                    {c.phoneCode ? ` · ${c.phoneCode}` : ""}
                  </p>
                </div>
                {c.enabledLevels.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                    {c.enabledLevels.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Country detail / tree */}
        <div>
          {selectedCountry ? (
            <CountryPanel
              country={selectedCountry}
              canEdit={canEdit}
              onCountryUpdated={(c) => {
                setSelectedCountry(c);
                setCountries((p) =>
                  p.map((x) => (x.id === c.id ? c : x))
                );
              }}
            />
          ) : (
            <div className="bg-gray-900 rounded-xl border border-dashed border-gray-700 p-12 text-center">
              <Globe className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                Pick a country on the left to manage its locations.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Country panel — settings + tree
// ────────────────────────────────────────────────────────────────────────────

function CountryPanel({
  country,
  canEdit,
  onCountryUpdated,
}: {
  country: CountryRow;
  canEdit: boolean;
  onCountryUpdated: (c: CountryRow) => void;
}) {
  const [levelsDirty, setLevelsDirty] = useState<string[]>(country.enabledLevels);
  const [savingLevels, setSavingLevels] = useState(false);

  // Reset when country switches
  useEffect(() => {
    setLevelsDirty(country.enabledLevels);
  }, [country.id, country.enabledLevels]);

  const toggleLevel = (lvl: LocationType) => {
    setLevelsDirty((p) =>
      p.includes(lvl) ? p.filter((x) => x !== lvl) : [...p, lvl]
    );
  };

  const saveLevels = async () => {
    setSavingLevels(true);
    try {
      const ordered = LEVEL_ORDER.filter((l) => levelsDirty.includes(l));
      const r = await fetch(`/api/admin/countries/${country.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledLevels: ordered }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success("Country levels saved");
      onCountryUpdated({ ...country, enabledLevels: ordered });
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setSavingLevels(false);
    }
  };

  const dirty =
    levelsDirty.length !== country.enabledLevels.length ||
    levelsDirty.some((l) => !country.enabledLevels.includes(l));

  return (
    <div className="space-y-4">
      {/* Country header + enabledLevels editor */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white inline-flex items-center gap-2">
              <span className="text-xl">{country.flag ?? "🏳️"}</span>
              {country.name}
            </h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {country.iso2}
              {country.phoneCode ? ` · ${country.phoneCode}` : ""}
            </p>
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">
            Enabled dropdown levels
          </p>
          <p className="text-[11px] text-gray-500 mb-2">
            Pick which dropdowns show for this country in the LocationSelector.
            Order is fixed top-to-bottom; deselected levels become free text
            inputs.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_LOCATION_TYPES.map((lvl) => {
              const active = levelsDirty.includes(lvl);
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => canEdit && toggleLevel(lvl)}
                  disabled={!canEdit}
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-bold transition-colors",
                    active
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "bg-gray-950 border-gray-700 text-gray-400 hover:border-gray-600",
                    !canEdit && "opacity-60"
                  )}
                >
                  {LOCATION_TYPE_LABEL[lvl]}
                </button>
              );
            })}
          </div>
          {canEdit && dirty && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={saveLevels}
                disabled={savingLevels}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {savingLevels ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Save levels
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tree */}
      <LocationTree country={country} canEdit={canEdit} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Location tree — top-level types, then expandable children
// ────────────────────────────────────────────────────────────────────────────

function LocationTree({
  country,
  canEdit,
}: {
  country: CountryRow;
  canEdit: boolean;
}) {
  const enabled = useMemo<LocationType[]>(() => {
    const set = new Set(country.enabledLevels);
    return LEVEL_ORDER.filter((t) => set.has(t));
  }, [country.enabledLevels]);

  const topType = enabled[0];
  const [topRows, setTopRows] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!topType) {
      setTopRows([]);
      return;
    }
    let cancel = false;
    setLoading(true);
    fetch(
      `/api/locations/children?countryId=${country.id}&type=${topType}&limit=1000`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancel) setTopRows(d.items ?? []);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [country.id, topType, refreshKey]);

  if (!topType) {
    return (
      <div className="bg-gray-900 rounded-xl border border-dashed border-gray-700 p-8 text-center">
        <p className="text-sm text-gray-400">
          No dropdown levels enabled for {country.name}. Toggle one above to
          start adding locations.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-bold text-white">
          {LOCATION_TYPE_LABEL[topType]}
          <span className="text-gray-500 font-normal ml-2">
            ({topRows.length})
          </span>
        </h3>
        {canEdit && (
          <AddLocationButton
            countryId={country.id}
            parentId={null}
            type={topType}
            onCreated={() => setRefreshKey((k) => k + 1)}
          />
        )}
      </div>

      {loading && (
        <div className="text-center py-4 text-xs text-gray-500">Loading…</div>
      )}

      {!loading && topRows.length === 0 && (
        <div className="text-center py-6 text-xs text-gray-500">
          No {LOCATION_TYPE_LABEL[topType].toLowerCase()} yet. Click + to add.
        </div>
      )}

      <div className="space-y-1.5">
        {topRows.map((row) => (
          <TreeRow
            key={row.id}
            row={row}
            depth={0}
            countryId={country.id}
            enabled={enabled}
            canEdit={canEdit}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
        ))}
      </div>
    </div>
  );
}

function TreeRow({
  row,
  depth,
  countryId,
  enabled,
  canEdit,
  onChanged,
}: {
  row: LocationRow;
  depth: number;
  countryId: string;
  enabled: LocationType[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<LocationRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(row.name);
  const [editPostal, setEditPostal] = useState(row.postalCode ?? "");
  const [busy, setBusy] = useState(false);

  const childType = useMemo<LocationType | null>(() => {
    const idx = enabled.findIndex((t) => t === row.type);
    if (idx === -1) return null;
    return enabled[idx + 1] ?? null;
  }, [enabled, row.type]);

  const loadChildren = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/locations/children?parentId=${row.id}&limit=1000`
      );
      const d = await r.json();
      setChildren(d.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [row.id]);

  const toggleExpand = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && children === null && childType) await loadChildren();
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/locations/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          postalCode: editPostal.trim() || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success("Updated");
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !(await confirmDialog({
        title: `Disable "${row.name}" and all its descendants?`,
        description:
          "It will stop appearing in dropdowns. You can re-enable it later from the audit log if needed.",
        tone: "danger",
        confirmLabel: "Disable",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/locations/${row.id}`, {
        method: "DELETE",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success(`Disabled ${d.disabledCount} row${d.disabledCount === 1 ? "" : "s"}`);
      onChanged();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800/40"
        style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
      >
        <button
          type="button"
          onClick={toggleExpand}
          disabled={!childType}
          className={cn(
            "p-0.5 text-gray-500 hover:text-white",
            !childType && "opacity-30 pointer-events-none"
          )}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {editing ? (
          <>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex-1 px-2 py-1 bg-gray-950 border border-gray-700 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <input
              type="text"
              value={editPostal}
              onChange={(e) => setEditPostal(e.target.value)}
              placeholder="postal"
              className="w-24 px-2 py-1 bg-gray-950 border border-gray-700 rounded text-xs text-white tabular-nums focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditName(row.name);
                setEditPostal(row.postalCode ?? "");
              }}
              disabled={busy}
              className="p-1 text-gray-500 hover:text-white rounded disabled:opacity-50"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold w-20 shrink-0">
              {LOCATION_TYPE_LABEL[row.type as LocationType] ?? row.type}
            </span>
            <span className="flex-1 text-sm text-white truncate">{row.name}</span>
            {row.postalCode && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500 font-mono">
                <Hash className="w-2.5 h-2.5" />
                {row.postalCode}
              </span>
            )}
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="p-1 text-gray-500 hover:text-white"
                  title="Rename"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="p-1 text-gray-500 hover:text-red-400 disabled:opacity-50"
                  title="Disable"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {childType && (
                  <AddLocationButton
                    countryId={countryId}
                    parentId={row.id}
                    type={childType}
                    compact
                    onCreated={() => {
                      // Force reload children + expand
                      setChildren(null);
                      setExpanded(true);
                      loadChildren();
                    }}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

      {expanded && childType && (
        <div className="border-l border-gray-800 ml-3">
          {loading && (
            <div className="text-xs text-gray-500 px-3 py-2">Loading…</div>
          )}
          {!loading && children && children.length === 0 && (
            <div className="text-xs text-gray-500 px-3 py-2 italic">
              No {LOCATION_TYPE_LABEL[childType].toLowerCase()} yet
            </div>
          )}
          {!loading &&
            children &&
            children.map((c) => (
              <TreeRow
                key={c.id}
                row={c}
                depth={depth + 1}
                countryId={countryId}
                enabled={enabled}
                canEdit={canEdit}
                onChanged={() => {
                  // Bubble: reload this row's children
                  setChildren(null);
                  loadChildren();
                  onChanged();
                }}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Add location button — small modal-like form
// ────────────────────────────────────────────────────────────────────────────

function AddLocationButton({
  countryId,
  parentId,
  type,
  compact,
  onCreated,
}: {
  countryId: string;
  parentId: string | null;
  type: LocationType;
  compact?: boolean;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryId,
          parentId,
          name: name.trim(),
          type,
          postalCode: postalCode.trim() || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      toast.success(`Added ${LOCATION_TYPE_LABEL[type].toLowerCase()}`);
      setName("");
      setPostalCode("");
      setOpen(false);
      onCreated();
    } catch (err) {
      toast.error("Failed", {
        description: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-bold rounded-lg transition-colors",
          compact
            ? "p-1 text-indigo-400 hover:bg-indigo-500/10"
            : "px-2.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white"
        )}
        title={`Add ${LOCATION_TYPE_LABEL[type].toLowerCase()}`}
      >
        <Plus className={compact ? "w-3.5 h-3.5" : "w-3.5 h-3.5"} />
        {!compact && `Add ${LOCATION_TYPE_LABEL[type]}`}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 ml-1 bg-gray-950 border border-indigo-500/30 rounded-lg px-2 py-1">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={LOCATION_TYPE_LABEL[type]}
        className="w-32 px-2 py-0.5 bg-gray-900 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-indigo-500"
        autoFocus
      />
      <input
        type="text"
        value={postalCode}
        onChange={(e) => setPostalCode(e.target.value)}
        placeholder="postal"
        className="w-20 px-2 py-0.5 bg-gray-900 border border-gray-700 rounded text-xs text-white tabular-nums focus:outline-none focus:border-indigo-500"
      />
      <button
        type="button"
        onClick={submit}
        disabled={busy || !name.trim()}
        className="p-0.5 text-emerald-400 hover:bg-emerald-500/10 rounded disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Check className="w-3.5 h-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
          setPostalCode("");
        }}
        disabled={busy}
        className="p-0.5 text-gray-500 hover:text-white rounded"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
