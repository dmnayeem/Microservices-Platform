/**
 * The country a user is targeted by (tasks, boards, missions, banners, ads,
 * notifications).
 *
 * The profile country when the user gave one — they said it, and it is what
 * a rule like "Bangladesh only" was always matched against. When they did not
 * (most never have), the country of their IP address (`lastCountry`, else
 * `signupCountry`, both ISO2 from src/lib/geo.ts), so a country rule still
 * reaches them instead of hiding everything from them.
 *
 * Returns an ISO2 code, the format the audience pickers store. Client-safe.
 */
export interface CountrySources {
  country?: string | null;
  lastCountry?: string | null;
  signupCountry?: string | null;
}

let nameToCode: Map<string, string> | null = null;

/**
 * "Match country targeting by IP only" (/admin/settings → Network anti-abuse).
 * Off: profile country, else IP. On: the IP country, whatever the profile
 * says — a user cannot reach another country's tasks by typing it in.
 * Server code sets it per request from the cached setting (country-mode.ts);
 * it is a platform-wide switch, so one value per instance is correct.
 */
let ipOnly = false;
export function setCountryIpOnly(v: boolean): void {
  ipOnly = v;
}
export function isCountryIpOnly(): boolean {
  return ipOnly;
}

/** "Bangladesh" / "bd" / "BD" → "BD"; anything unrecognised → null. */
export function toIso2(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  if (!nameToCode) {
    nameToCode = new Map();
    try {
      const dn = new Intl.DisplayNames(["en"], { type: "region" });
      for (let a = 65; a <= 90; a++) {
        for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          const name = dn.of(code);
          if (name && name !== code) nameToCode.set(name.toLowerCase(), code);
        }
      }
    } catch {
      /* no Intl region data — names stay unresolved */
    }
    // Spellings people type that the standard names do not cover.
    for (const [n, c] of [["uae", "AE"], ["usa", "US"], ["uk", "GB"], ["england", "GB"]] as const) nameToCode.set(n, c);
  }
  return nameToCode.get(v.toLowerCase()) ?? null;
}

export function effectiveCountry(u: CountrySources | null | undefined): string | null {
  if (!u) return null;
  const ip = toIso2(u.lastCountry) ?? toIso2(u.signupCountry);
  if (ipOnly) return ip;
  return toIso2(u.country) ?? ip;
}
