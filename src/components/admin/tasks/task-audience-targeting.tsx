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

import { useEffect, useState } from "react";
import { Users, Cake, Globe } from "lucide-react";
import { GENDER_OPTIONS } from "@/lib/ad-targeting";
import {
  AudienceGeoPicker,
  Chip,
  loadCountryOptions,
  type CountryOption,
} from "@/components/shared/audience-geo-picker";
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

const fieldCls =
  "w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50";

export function TaskAudienceTargeting({ value, onChange, disabled }: Props) {
  const [countries, setCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    let cancel = false;
    loadCountryOptions().then((list) => {
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

      {/* Location (state / division / district / sub-district) — shared with
          the ad audience builder so both target the same way. */}
      <AudienceGeoPicker
        countries={countries}
        value={value}
        onChange={(patch) => onChange(patch as Partial<TaskAudienceValue>)}
        disabled={disabled}
        hint="Empty = anywhere in the targeted countries. Add a division to target all of it, or drill down to specific districts / upazilas."
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

