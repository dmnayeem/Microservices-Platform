import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Download, Smartphone } from "lucide-react";
import { DEVICE_RANGES, deviceFilterQuery, deviceListWhere, parseDeviceFilters } from "@/lib/device-report";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  describeDevice,
  deviceBrandLabel,
  deviceBrowserLabel,
  deviceOsLabel,
  deviceTypeLabel,
} from "@/lib/device-info";

/**
 * Devices — which phones, tablets and computers people use: type, system,
 * brand, browser, and every device with its full user agent. Filters drive
 * both the breakdowns and the list, and every count is PEOPLE (one person on
 * two phones counts once per brand). Targeting on these same values lives on
 * tasks, banners, popups and notifications (lib/device-target.ts).
 */
export const dynamic = "force-dynamic";

const RANGES = DEVICE_RANGES;
const PAGE = 50;

type Count = { k: string | null; n: number };
type DeviceRow = {
  id: string;
  deviceType: string | null;
  os: string | null;
  osVersion: string | null;
  brand: string | null;
  model: string | null;
  browser: string | null;
  userAgent: string | null;
  country: string | null;
  lastSeenAt: Date;
  seenCount: number;
  user: { id: string; name: string | null; email: string };
};
const FIELDS = { type: "deviceType", os: "os", brand: "brand", browser: "browser" } as const;
type FilterKey = keyof typeof FIELDS;

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; type?: string; os?: string; brand?: string; browser?: string; q?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await can(session.user.id, "analytics.view"))) redirect("/admin");

  const sp = await searchParams;
  const f = parseDeviceFilters(sp);
  const range = RANGES.find((r) => r.id === f.rangeId) ?? RANGES[1];
  const since = f.since;
  const filters: Record<FilterKey, string | null> = { type: f.type, os: f.os, brand: f.brand, browser: f.browser };
  const q = f.q;
  const page = Math.max(1, Math.min(200, parseInt(sp.page ?? "1", 10) || 1));

  // One WHERE for the breakdowns (raw SQL)…
  const conds: Prisma.Sql[] = [
    Prisma.sql`d."lastSeenAt" >= ${since}`,
    Prisma.sql`u.role IN ('USER','TUTOR','AGENCY')`,
  ];
  for (const [k, col] of Object.entries(FIELDS) as [FilterKey, string][]) {
    const v = filters[k];
    if (!v) continue;
    conds.push(v === "unknown" ? Prisma.sql`d.${Prisma.raw(`"${col}"`)} IS NULL` : Prisma.sql`d.${Prisma.raw(`"${col}"`)} = ${v}`);
  }
  if (q) conds.push(Prisma.sql`(u.email ILIKE ${`%${q}%`} OR u.name ILIKE ${`%${q}%`})`);
  const where = Prisma.join(conds, " AND ");
  const by = (col: string) =>
    prisma.$queryRaw<Count[]>`
      SELECT d.${Prisma.raw(`"${col}"`)} AS k, COUNT(DISTINCT d."userId")::int AS n
      FROM "UserDevice" d JOIN "User" u ON u.id = d."userId"
      WHERE ${where}
      GROUP BY 1 ORDER BY 2 DESC`;

  // …and the same for the list (Prisma).
  const listWhere = deviceListWhere(f);

  const [types, oses, brands, browsers, people, both, total, rows] = await Promise.all([
    by("deviceType"),
    by("os"),
    by("brand"),
    by("browser"),
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT d."userId")::int AS n FROM "UserDevice" d JOIN "User" u ON u.id = d."userId" WHERE ${where}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM (
        SELECT d."userId" FROM "UserDevice" d JOIN "User" u ON u.id = d."userId"
        WHERE ${where}
        GROUP BY d."userId"
        HAVING bool_or(d."deviceType" IN ('mobile','tablet')) AND bool_or(d."deviceType" = 'desktop')
      ) x`,
    prisma.userDevice.count({ where: listWhere }),
    prisma.userDevice.findMany({
      where: listWhere,
      orderBy: { lastSeenAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        deviceType: true,
        os: true,
        osVersion: true,
        brand: true,
        model: true,
        browser: true,
        userAgent: true,
        country: true,
        lastSeenAt: true,
        seenCount: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }) as unknown as Promise<DeviceRow[]>,
  ]);

  const peopleN = people[0]?.n ?? 0;
  const mobileN = types.filter((t) => t.k === "mobile" || t.k === "tablet").reduce((s, t) => s + t.n, 0);
  const desktopN = types.find((t) => t.k === "desktop")?.n ?? 0;
  const pct = (a: number) => (peopleN ? `${Math.round((a / peopleN) * 100)}%` : "—");

  const href = (patch: Partial<Record<FilterKey | "range" | "q" | "page", string | null>>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null> = { range: range.id === "30" ? null : range.id, ...filters, q: q || null, page: null };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/devices${s ? `?${s}` : ""}`;
  };

  const Breakdown = ({
    title,
    field,
    data,
    label,
  }: {
    title: string;
    field: FilterKey;
    data: Count[];
    label: (k: string | null) => string;
  }) => {
    const max = Math.max(1, ...data.map((d) => d.n));
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-2 flex items-center">
          <p className="flex-1 text-sm font-bold text-white">{title}</p>
          {filters[field] && (
            <Link href={href({ [field]: null })} className="text-[11px] text-sky-400 hover:underline">
              Clear
            </Link>
          )}
        </div>
        {data.length === 0 && <p className="text-xs text-slate-500">No devices.</p>}
        <ul className="space-y-1.5">
          {data.slice(0, 14).map((d) => {
            const key = d.k ?? "unknown";
            const on = filters[field] === key;
            return (
              <li key={key}>
                <Link href={href({ [field]: on ? null : key })} className={`block rounded px-1 ${on ? "bg-sky-500/15" : "hover:bg-slate-800/50"}`}>
                  <span className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate text-slate-200">{d.k ? label(d.k) : "Unknown"}</span>
                    <span className="font-semibold text-white">{d.n.toLocaleString()}</span>
                    <span className="w-9 text-right text-slate-500">{pct(d.n)}</span>
                  </span>
                  <span className="mt-0.5 block h-1 rounded-full bg-slate-800">
                    <span className="block h-1 rounded-full bg-sky-500" style={{ width: `${Math.max(2, (d.n / max) * 100)}%` }} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-white">Devices</h1>
          <p className="text-sm text-slate-400">
            Which phones, tablets and computers your users use. Click any line to filter everything by it.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((r) => (
            <Link
              key={r.id}
              href={href({ range: r.id === "30" ? null : r.id })}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                r.id === range.id ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300 hover:text-white"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["People seen", peopleN.toLocaleString()],
          ["On a phone or tablet", `${mobileN.toLocaleString()} · ${pct(mobileN)}`],
          ["On a computer", `${desktopN.toLocaleString()} · ${pct(desktopN)}`],
          ["Use both", `${(both[0]?.n ?? 0).toLocaleString()} · ${pct(both[0]?.n ?? 0)}`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs text-slate-500">{l}</p>
            <p className="mt-1 text-xl font-bold text-white">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Breakdown title="Device type" field="type" data={types} label={deviceTypeLabel} />
        <Breakdown title="System" field="os" data={oses} label={deviceOsLabel} />
        <Breakdown title="Phone brand" field="brand" data={brands} label={deviceBrandLabel} />
        <Breakdown title="Browser" field="browser" data={browsers} label={deviceBrowserLabel} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60">
        <form className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-3" action="/admin/devices">
          {range.id !== "30" && <input type="hidden" name="range" value={range.id} />}
          {(Object.keys(filters) as FilterKey[]).map((k) =>
            filters[k] ? <input key={k} type="hidden" name={k} value={filters[k]!} /> : null
          )}
          <p className="flex-1 text-sm font-bold text-white">
            Devices <span className="font-normal text-slate-500">· {total.toLocaleString()}</span>
          </p>
          <input
            name="q"
            defaultValue={q}
            placeholder="Find a user (name or email)"
            className="w-56 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder:text-slate-500"
          />
          <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">Search</button>
          <a
            href={`/api/admin/devices/export${deviceFilterQuery(f) ? `?${deviceFilterQuery(f)}` : ""}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            title="Download these devices (with the filters above) as a CSV file for Excel"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </a>
        </form>
        <ul className="divide-y divide-slate-800/70">
          {rows.length === 0 && <li className="p-4 text-xs text-slate-500">No devices match.</li>}
          {rows.map((d) => (
            <li key={d.id} className="px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                <Link href={`/admin/users/${d.user.id}`} className="min-w-0 max-w-56 truncate font-semibold text-white hover:underline">
                  {d.user.name || d.user.email}
                </Link>
                <span className="text-slate-300">
                  {describeDevice({
                    type: (d.deviceType ?? undefined) as never,
                    os: d.os ?? undefined,
                    osVersion: d.osVersion,
                    brand: d.brand,
                    model: d.model,
                    browser: d.browser ?? undefined,
                  })}
                </span>
                {d.country && <span className="text-[11px] text-slate-500">{d.country}</span>}
                <span className="ml-auto text-[11px] text-slate-500">
                  {formatDistanceToNow(d.lastSeenAt, { addSuffix: true })} · {d.seenCount}×
                </span>
              </div>
              {d.userAgent && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">User agent</summary>
                  <code className="mt-1 block break-all text-[11px] text-slate-400">{d.userAgent}</code>
                </details>
              )}
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 p-3 text-xs">
            {page > 1 ? (
              <Link href={href({ page: String(page - 1) })} className="text-sky-400 hover:underline">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-slate-500">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={href({ page: String(page + 1) })} className="text-sky-400 hover:underline">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-500">
        Phone brand comes from the phone model, which Chrome on Android only gives when the app asks for it — so brands
        fill in as people come back to the site. Devices are recorded for signed-in users.
      </p>
    </div>
  );
}
