/**
 * The wall-clock time of `at` in `tz`, as a Date whose LOCAL fields hold it,
 * so date-fns `format()` prints the member's own time whether it runs on the
 * server (UTC) or in the browser. Display only. Never store or compare the
 * result. An absent or invalid zone returns the instant unchanged.
 */
export function inZone(at: Date | string, tz?: string | null): Date {
  const d = new Date(at);
  if (!tz) return d;
  try {
    const parts: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(d)) {
      if (p.type !== "literal") parts[p.type] = p.value;
    }
    return new Date(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  } catch {
    return d;
  }
}
