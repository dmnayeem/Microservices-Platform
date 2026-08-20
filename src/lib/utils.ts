import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * THE money formatter. Every `$…` on screen should come from here so the same
 * value can't render as `$1234.57` on one page and `$1,234.57` on another.
 *
 * Accepts a Prisma `Decimal` too: it is coerced via `String()` first, because
 * `Decimal.toLocaleString(opts)` silently IGNORES its options and emits the raw
 * 6-dp value (that is how `/admin/withdrawals` came to show `$1234.567891`).
 */
export function usd(
  x: number | string | { toString(): string } | null | undefined,
  opts: { dp?: number; compact?: boolean } = {}
): string {
  const n = x == null ? 0 : typeof x === "number" ? x : Number(String(x));
  const safe = Number.isFinite(n) ? n : 0;
  const dp = opts.dp ?? 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.compact ? 0 : dp,
    maximumFractionDigits: opts.compact ? 1 : dp,
    ...(opts.compact ? { notation: "compact" as const } : {}),
  }).format(safe);
}

/** Points/counts with thousands separators, compact past a million. */
export function pts(n: number, opts: { compact?: boolean } = {}): string {
  const safe = Number.isFinite(n) ? n : 0;
  return opts.compact || safe >= 1_000_000
    ? formatCompact(safe)
    : safe.toLocaleString();
}

/** Compact notation for tight spaces: 1.2K / 1.2M. */
export function formatCompact(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(safe);
}

/** @deprecated use {@link formatCompact}. */
export const formatPoints = formatCompact;

/**
 * Guarded percentage — returns 0 (not `NaN`) on a zero denominator and clamps to
 * 0–100, so progress bars can't render `width: NaN%`.
 */
export function pct(part: number, whole: number, dp = 0): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  const raw = (part / whole) * 100;
  const clamped = Math.max(0, Math.min(100, raw));
  return dp > 0 ? Number(clamped.toFixed(dp)) : Math.round(clamped);
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return formatDate(d);
}

export function generateReferralCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// `calculateLevel` / `calculateXpProgress` (a `level² × 100` curve) and
// `pointsToCash` / `cashToPoints` (hardcoded 1000 pts/$) used to live here.
// They were a second, silently-diverging source of truth: the XP curve is now
// `@/lib/level` (matching what the server writes) and the points rate comes
// from `@/lib/economy`, which reads the admin-configurable setting.

export function truncateString(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[\d\s-]{10,}$/;
  return phoneRegex.test(phone);
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
