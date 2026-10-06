/**
 * Web Storage that never throws.
 *
 * `localStorage` / `sessionStorage` throw (SecurityError / QuotaExceededError)
 * in private modes, with site data blocked, in some in-app browsers, and when
 * full. An unguarded read in a render or effect takes the whole page down —
 * these return `null` / do nothing instead, so the caller treats it as "no
 * saved preference".
 */

type Area = "local" | "session";

function store(area: Area): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return area === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function get(area: Area, key: string): string | null {
  try {
    return store(area)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(area: Area, key: string, value: string): void {
  try {
    store(area)?.setItem(key, value);
  } catch {
    // Not persisted — the preference lasts for this page view only.
  }
}

function remove(area: Area, key: string): void {
  try {
    store(area)?.removeItem(key);
  } catch {
    // ignore
  }
}

export const lsGet = (key: string) => get("local", key);
export const lsSet = (key: string, value: string) => set("local", key, value);
export const lsRemove = (key: string) => remove("local", key);
export const ssGet = (key: string) => get("session", key);
export const ssSet = (key: string, value: string) => set("session", key, value);
