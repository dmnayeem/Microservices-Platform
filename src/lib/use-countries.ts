"use client";

import { useEffect, useState } from "react";

/**
 * The ONE canonical country list — served from the `Country` DB table via
 * `/api/locations/countries`. Use this everywhere a country dropdown is needed
 * (ad targeting, offerwalls, etc.) so ISO codes match `User.country` and there's
 * a single source of truth (no more hardcoded per-feature arrays).
 */
export interface CountryOpt {
  code: string; // ISO2 — matches User.country
  name: string;
  flag: string | null;
}

// Module-level cache shared across every hook instance.
let cache: CountryOpt[] | null = null;
let inflight: Promise<CountryOpt[]> | null = null;

async function load(): Promise<CountryOpt[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/locations/countries")
      .then((r) => (r.ok ? r.json() : { countries: [] }))
      .then((d) => {
        const list: CountryOpt[] = (d.countries ?? []).map(
          (c: { iso2: string; name: string; flag: string | null }) => ({
            code: c.iso2,
            name: c.name,
            flag: c.flag ?? null,
          })
        );
        cache = list;
        return list;
      })
      .catch(() => [] as CountryOpt[]);
  }
  return inflight;
}

/** Returns the DB country list (empty until loaded). */
export function useCountries(fallback: CountryOpt[] = []): CountryOpt[] {
  const [countries, setCountries] = useState<CountryOpt[]>(cache ?? fallback);
  useEffect(() => {
    let alive = true;
    load().then((list) => {
      if (alive && list.length) setCountries(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  return countries;
}
