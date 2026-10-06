import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { toNum } from "@/lib/money";
import { usd } from "@/lib/utils";
import { AD_NETWORKS, getAdNetwork } from "@/lib/ad-networks/registry";

/**
 * Third-party network revenue, entered by hand per day — AdSense, Adsterra and
 * the rest report earnings only in their own dashboards. The measurement
 * report divides it by our valid viewable impressions to show eCPM.
 *
 * Money: reading needs `finance.view`, writing also needs `ads.manage`.
 */

function parseDay(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// GET /api/admin/ads/network-revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [view, money, manage] = await Promise.all([
    can(session.user.id, "ads.view"),
    can(session.user.id, "finance.view"),
    can(session.user.id, "ads.manage"),
  ]);
  if (!view || !money) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const to = parseDay(sp.get("to")) ?? new Date(new Date().toISOString().slice(0, 10));
  const from = parseDay(sp.get("from")) ?? new Date(to.getTime() - 30 * 86_400_000);

  const rows = await prisma.adNetworkRevenue.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: [{ date: "desc" }, { network: "asc" }],
    take: 2000,
  });
  return NextResponse.json({
    canEdit: manage,
    networks: AD_NETWORKS.filter((n) => n.id !== "custom").map((n) => ({ id: n.id, name: n.name })),
    rows: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      network: r.network,
      networkName: getAdNetwork(r.network)?.name ?? r.network,
      revenueUsd: toNum(r.revenueUsd),
      note: r.note,
    })),
  });
}

const putSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  network: z.string().min(1).max(40),
  revenueUsd: z.number().min(0).max(1_000_000),
  note: z.string().max(300).optional().nullable(),
});

// PUT — set (not add) one day's revenue for one network. 0 is a real value.
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [money, manage] = await Promise.all([
    can(session.user.id, "finance.view"),
    can(session.user.id, "ads.manage"),
  ]);
  if (!money || !manage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const v = putSchema.safeParse(await req.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: "Enter a date, a network and an amount." }, { status: 400 });
  const date = parseDay(v.data.date);
  if (!date || date.getTime() > Date.now()) {
    return NextResponse.json({ error: "Pick a date that is not in the future." }, { status: 400 });
  }
  if (!getAdNetwork(v.data.network)) return NextResponse.json({ error: "Unknown network." }, { status: 400 });

  const revenueUsd = Math.round(v.data.revenueUsd * 100) / 100;
  const before = await prisma.adNetworkRevenue.findUnique({
    where: { date_network: { date, network: v.data.network } },
  });
  const row = await prisma.adNetworkRevenue.upsert({
    where: { date_network: { date, network: v.data.network } },
    create: { date, network: v.data.network, revenueUsd, note: v.data.note ?? null, enteredById: session.user.id },
    update: { revenueUsd, note: v.data.note ?? null, enteredById: session.user.id },
  });
  await writeAudit({
    actorId: session.user.id,
    action: "ADS_NETWORK_REVENUE_SET",
    entity: "AdNetworkRevenue",
    entityId: row.id,
    summary: `Set ${v.data.network} revenue for ${v.data.date} to ${usd(revenueUsd)}`,
    meta: { before: before ? toNum(before.revenueUsd) : null, after: revenueUsd },
  });
  return NextResponse.json({ ok: true });
}

// DELETE ?id= — remove a mistaken entry.
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [money, manage] = await Promise.all([
    can(session.user.id, "finance.view"),
    can(session.user.id, "ads.manage"),
  ]);
  if (!money || !manage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const row = await prisma.adNetworkRevenue.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await prisma.adNetworkRevenue.delete({ where: { id } });
  await writeAudit({
    actorId: session.user.id,
    action: "ADS_NETWORK_REVENUE_DELETE",
    entity: "AdNetworkRevenue",
    entityId: id,
    summary: `Deleted ${row.network} revenue for ${row.date.toISOString().slice(0, 10)}`,
    meta: { before: toNum(row.revenueUsd) },
  });
  return NextResponse.json({ ok: true });
}
