import type { Prisma } from "@/generated/prisma/client";
import { DEVICE_BRANDS, DEVICE_BROWSERS, DEVICE_OSES, DEVICE_TYPES } from "@/lib/device-info";

/**
 * The Devices report's filters (/admin/devices), shared by the page and its CSV
 * export so the file always holds exactly what the screen shows.
 */

export const DEVICE_RANGES = [
  { id: "7", label: "7 days", days: 7 },
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "all", label: "All time", days: null },
] as const;

export type DeviceFilterKey = "type" | "os" | "brand" | "browser";

export interface DeviceFilters {
  rangeId: string;
  since: Date;
  type: string | null;
  os: string | null;
  brand: string | null;
  browser: string | null;
  q: string;
}

export function parseDeviceFilters(sp: Record<string, string | undefined>): DeviceFilters {
  const range = DEVICE_RANGES.find((r) => r.id === sp.range) ?? DEVICE_RANGES[1];
  const valid = (v: string | undefined, list: { key: string }[]) =>
    v && (v === "unknown" || list.some((x) => x.key === v)) ? v : null;
  return {
    rangeId: range.id,
    since: range.days ? new Date(Date.now() - range.days * 86_400_000) : new Date(0),
    type: valid(sp.type, DEVICE_TYPES),
    os: valid(sp.os, DEVICE_OSES),
    brand: valid(sp.brand, DEVICE_BRANDS),
    browser: valid(sp.browser, DEVICE_BROWSERS),
    q: (sp.q ?? "").trim().slice(0, 80),
  };
}

/** Users only (staff are not the audience), seen in the range, matching the filters. */
export function deviceListWhere(f: DeviceFilters): Prisma.UserDeviceWhereInput {
  const eq = (v: string | null) => (v === "unknown" ? null : v);
  return {
    lastSeenAt: { gte: f.since },
    user: {
      role: { in: ["USER", "TUTOR", "AGENCY"] },
      ...(f.q
        ? { OR: [{ email: { contains: f.q, mode: "insensitive" } }, { name: { contains: f.q, mode: "insensitive" } }] }
        : {}),
    },
    ...(f.type ? { deviceType: eq(f.type) } : {}),
    ...(f.os ? { os: eq(f.os) } : {}),
    ...(f.brand ? { brand: eq(f.brand) } : {}),
    ...(f.browser ? { browser: eq(f.browser) } : {}),
  };
}

/** The same filters as a query string (for the export link). */
export function deviceFilterQuery(f: DeviceFilters): string {
  const p = new URLSearchParams();
  if (f.rangeId !== "30") p.set("range", f.rangeId);
  for (const k of ["type", "os", "brand", "browser"] as const) if (f[k]) p.set(k, f[k]!);
  if (f.q) p.set("q", f.q);
  return p.toString();
}
