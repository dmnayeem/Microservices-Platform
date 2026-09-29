import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The stored values of a handful of SystemSetting keys, for a settings panel
 * on a feature page. Read the same way the System Settings page reads them
 * (raw rows, `{ v: value }` unwrapped), so a panel shows exactly what that
 * form showed. A key with no row is simply absent — the panel falls back to
 * its defaults, as the form did.
 */
export async function loadSettingValues(
  keys: readonly string[]
): Promise<Record<string, unknown>> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...keys] } },
    select: { key: true, value: true },
  });
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    out[r.key] =
      r.value && typeof r.value === "object" && "v" in (r.value as object)
        ? (r.value as { v: unknown }).v
        : r.value;
  }
  return out;
}
