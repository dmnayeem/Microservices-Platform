import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { deriveSource, SOURCE_ORDER, type SourceKey } from "@/lib/tx-sources";
import { direction, magnitudeUsd } from "@/lib/finance/signing";
import { csvFilename, csvResponse, toCsv } from "@/lib/csv";

/**
 * The searchable ledger — the view that did not exist.
 *
 * `/admin/finance` could show totals by type and nothing else: no way to see the
 * rows behind a figure, find one user's history, or answer "what was this
 * $47?". Every drilldown ended at an aggregate.
 *
 * Gated on `finance.view`, which `stripProtectedForRole` already limits to
 * SUPER_ADMIN and the built-in FINANCE_ADMIN. No new permission: a new one would
 * have to be added to `FINANCE_PERMISSIONS` or a per-user override could hand
 * money figures to a marketing admin.
 */

const PAGE = 50;

function parseRange(sp: URLSearchParams): { from?: Date; to?: Date } {
  const days = Number(sp.get("days"));
  if (Number.isFinite(days) && days > 0) {
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    return { from };
  }
  return {};
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "finance.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const source = sp.get("source");
  const type = sp.get("type");
  const status = sp.get("status");
  const search = (sp.get("q") ?? "").trim();
  const page = Math.max(0, Number(sp.get("page")) || 0);
  const wantsCsv = sp.get("format") === "csv";
  const { from } = parseRange(sp);

  const where = {
    ...(type && type !== "all" ? { type: type as never } : {}),
    ...(status && status !== "all" ? { status: status as never } : {}),
    ...(from ? { createdAt: { gte: from } } : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { user: { email: { contains: search, mode: "insensitive" as const } } },
            { user: { name: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  // Source is derived from type + reference in application code, so it cannot be
  // a database filter. Over-fetch and filter here — correct at this ledger size,
  // and the alternative is denormalising a column that would then need keeping
  // in sync with `deriveSource` forever.
  const overFetch = source && source !== "all";
  const take = wantsCsv ? 10_000 : overFetch ? PAGE * 8 : PAGE;

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: wantsCsv || overFetch ? 0 : page * PAGE,
      take,
      select: {
        id: true,
        type: true,
        status: true,
        amount: true,
        points: true,
        description: true,
        reference: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  type Row = (typeof rows)[number] & {
    user: { id: string; email: string; name: string | null; role: string } | null;
  };

  const shaped = (rows as unknown as Row[]).map((r) => {
    const lite = {
      type: r.type,
      status: r.status,
      reference: r.reference,
      amount: toNum(r.amount),
      points: r.points,
    };
    return {
      id: r.id,
      type: r.type,
      status: r.status,
      source: deriveSource(r.type, r.reference) as SourceKey,
      direction: direction(lite),
      amountUsd: toNum(r.amount),
      magnitudeUsd: magnitudeUsd(lite),
      points: r.points,
      description: r.description,
      reference: r.reference,
      metadata: r.metadata,
      createdAt: r.createdAt,
      user: r.user
        ? {
            id: r.user.id,
            email: r.user.email,
            name: r.user.name,
            // Shown so a figure driven by a seeded staff account is obvious in
            // the list rather than only in the totals.
            isStaff: r.user.role !== "USER",
          }
        : null,
    };
  });

  const filtered = overFetch
    ? shaped.filter((r) => r.source === source)
    : shaped;
  const pageRows = wantsCsv
    ? filtered
    : filtered.slice(overFetch ? page * PAGE : 0, (overFetch ? page * PAGE : 0) + PAGE);

  if (wantsCsv) {
    const csv = toCsv(
      ["Date (UTC)", "User", "Email", "Staff", "Source", "Type", "Status", "Direction", "Amount USD", "Points", "Description", "Reference"],
      filtered.map((r) => [
        r.createdAt.toISOString().slice(0, 19).replace("T", " "),
        r.user?.name ?? "",
        r.user?.email ?? "",
        r.user?.isStaff ? "yes" : "no",
        r.source,
        r.type,
        r.status,
        r.direction,
        r.amountUsd.toFixed(6),
        r.points,
        r.description ?? "",
        r.reference ?? "",
      ])
    );
    return csvResponse(csv, csvFilename("finance-ledger")) as unknown as NextResponse;
  }

  return NextResponse.json({
    rows: pageRows,
    total,
    page,
    pageSize: PAGE,
    // The over-fetch means the count is exact only when no source filter is on.
    totalIsExact: !overFetch,
    sources: SOURCE_ORDER,
  });
}
