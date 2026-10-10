import { DEVICE_BRANDS, DEVICE_OSES, DEVICE_TYPES, type DeviceInfo } from "@/lib/device-info";

/**
 * Device targeting — "only phones", "only Android", "only Samsung and
 * Xiaomi"… — shared by tasks, banners, popups (the CURRENT device of the person
 * looking) and notifications/email (any device the person has used lately).
 * Client-safe. Empty list = no rule for that dimension.
 *
 * STRICT like the rest of the audience rules: when a rule is set and the
 * device's value is unknown (e.g. a brand the phone did not report), it does
 * not match.
 */

export interface DeviceTarget {
  deviceTypes: string[];
  deviceOses: string[];
  deviceBrands: string[];
}

export const EMPTY_DEVICE_TARGET: DeviceTarget = { deviceTypes: [], deviceOses: [], deviceBrands: [] };

const pick = (v: unknown, allowed: { key: string }[]): string[] => {
  if (!Array.isArray(v)) return [];
  const ok = new Set(allowed.map((a) => a.key));
  return [...new Set(v.filter((x): x is string => typeof x === "string" && ok.has(x)))];
};

/** Keep only known keys. Accepts a request body or a stored row. */
export function sanitizeDeviceTarget(src: unknown): DeviceTarget {
  const o = (src && typeof src === "object" ? src : {}) as Record<string, unknown>;
  return {
    deviceTypes: pick(o.deviceTypes, DEVICE_TYPES),
    deviceOses: pick(o.deviceOses, DEVICE_OSES),
    deviceBrands: pick(o.deviceBrands, DEVICE_BRANDS),
  };
}

export function hasDeviceTarget(t: Partial<DeviceTarget> | null | undefined): boolean {
  return !!t && ((t.deviceTypes?.length ?? 0) > 0 || (t.deviceOses?.length ?? 0) > 0 || (t.deviceBrands?.length ?? 0) > 0);
}

type CurrentDevice = Pick<DeviceInfo, "type" | "os" | "brand"> | null | undefined;

/**
 * Does the current device pass the rule? `device === undefined` means "not
 * known in this context" (a background job): every rule passes. `null` means
 * "asked, and could not tell": only untargeted rows pass.
 */
export function matchesDeviceTarget(t: Partial<DeviceTarget> | null | undefined, device: CurrentDevice): boolean {
  if (!hasDeviceTarget(t) || device === undefined) return true;
  if (device === null) return false;
  if (t!.deviceTypes?.length && !t!.deviceTypes.includes(device.type)) return false;
  if (t!.deviceOses?.length && !t!.deviceOses.includes(device.os)) return false;
  if (t!.deviceBrands?.length && !t!.deviceBrands.includes(device.brand ?? "other")) return false;
  return true;
}

/**
 * The same rule as a Prisma `where` for any model with the three columns
 * (Task, Banner, SitePopup). `undefined` device = no clause.
 */
export function deviceTargetWhere<T>(device: CurrentDevice): T[] {
  if (device === undefined) return [];
  const clause = (field: keyof DeviceTarget, value: string | null) =>
    value ? { OR: [{ [field]: { isEmpty: true } }, { [field]: { has: value } }] } : { [field]: { isEmpty: true } };
  return [
    clause("deviceTypes", device?.type ?? null),
    clause("deviceOses", device?.os ?? null),
    clause("deviceBrands", device ? device.brand ?? "other" : null),
  ] as T[];
}
