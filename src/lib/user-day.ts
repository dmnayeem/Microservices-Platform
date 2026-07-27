import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { timezoneForCountry } from "@/lib/country-timezone";

// Per-user "local day" helpers. Daily resets (mission, bonus, task limits,
// earning caps, AI, feed post limit, referral, solo) key off the user's LOCAL
// midnight instead of UTC. Timezone resolution is country-first: an explicitly
// set User.timezone wins, else the country's representative zone, else UTC.

interface DateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Resolve a user's IANA timezone. Explicit non-UTC timezone wins; else the
 *  ISO2 country's representative zone; else UTC. */
export function resolveUserTimezone(u: {
  country?: string | null;
  timezone?: string | null;
}): string {
  if (u.timezone && u.timezone !== "UTC" && isValidTimeZone(u.timezone)) {
    return u.timezone;
  }
  const fromCountry = timezoneForCountry(u.country);
  if (fromCountry) return fromCountry;
  return "UTC";
}

/** Wall-clock date parts in `tz` for the instant `at`. Falls back to UTC parts
 *  if `tz` is somehow invalid. */
function partsIn(tz: string, at: Date): DateParts {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const out = {} as Record<string, string>;
    for (const p of dtf.formatToParts(at)) {
      if (p.type !== "literal") out[p.type] = p.value;
    }
    return out as unknown as DateParts;
  } catch {
    return {
      year: String(at.getUTCFullYear()),
      month: String(at.getUTCMonth() + 1).padStart(2, "0"),
      day: String(at.getUTCDate()).padStart(2, "0"),
      hour: String(at.getUTCHours()).padStart(2, "0"),
      minute: String(at.getUTCMinutes()).padStart(2, "0"),
      second: String(at.getUTCSeconds()).padStart(2, "0"),
    };
  }
}

/** "YYYY-MM-DD" for the given instant in `tz`. */
export function localDayKey(tz: string, now: Date = new Date()): string {
  const p = partsIn(tz, now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The UTC `Date` corresponding to the user's local midnight for `now`'s day. */
export function localStartOfDayUtc(tz: string, now: Date = new Date()): Date {
  const p = partsIn(tz, now);
  // The instant `now`, re-read as if its wall-clock were UTC.
  const wallAsUtc = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second
  );
  // How far the local wall-clock is ahead of UTC (ms).
  const offsetMs = wallAsUtc - now.getTime();
  const localMidnightWallAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, 0, 0, 0);
  return new Date(localMidnightWallAsUtc - offsetMs);
}

/** Local day-key `n` days before `now` (for streak walks). */
export function localDayKeyDaysAgo(
  tz: string,
  n: number,
  now: Date = new Date()
): string {
  return localDayKey(tz, new Date(now.getTime() - n * 86_400_000));
}

export interface UserDayContext {
  tz: string;
  dayKey: string;
  startOfDayUtc: Date;
}

/**
 * Resolve a user's local-day context. React.cache dedupes repeated calls within
 * a request; the timezone lookup is Accelerate-cached (tz rarely changes) so
 * this stays cheap even on hot paths.
 */
export const getUserDayContext = cache(
  async (userId: string): Promise<UserDayContext> => {
    let tz = "UTC";
    try {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { country: true, timezone: true },
        cacheStrategy: { ttl: 300, swr: 600 },
      });
      tz = resolveUserTimezone(u ?? {});
    } catch {
      tz = "UTC";
    }
    const now = new Date();
    return {
      tz,
      dayKey: localDayKey(tz, now),
      startOfDayUtc: localStartOfDayUtc(tz, now),
    };
  }
);
