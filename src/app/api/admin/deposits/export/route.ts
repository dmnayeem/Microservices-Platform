import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";

/** CSV cell escaper — handles commas/quotes/newlines so Excel parses cleanly. */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/admin/deposits/export?status=&method= — CSV of deposits (Excel-ready).
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "withdrawals.view")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const status = sp.get("status") ?? undefined;
  const method = sp.get("method") ?? undefined;

  const deposits = await prisma.deposit.findMany({
    where: {
      ...(status && status !== "all" ? { status } : {}),
      ...(method && method !== "all" ? { method } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const ids = [
    ...new Set([
      ...deposits.map((d) => d.userId),
      ...deposits.map((d) => d.reviewedBy).filter((v): v is string => !!v),
    ]),
  ];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  const byId = Object.fromEntries(users.map((u) => [u.id, u]));

  const headers = [
    "Date", "User", "Email", "Amount (USD)", "Method", "Txn ID",
    "Status", "Reviewed By", "Reviewed At", "Admin Note",
  ];
  const rows = [headers.map(csvCell).join(",")];
  for (const d of deposits) {
    const u = byId[d.userId];
    const rev = d.reviewedBy ? byId[d.reviewedBy] : null;
    rows.push(
      [
        csvCell(d.createdAt.toISOString()),
        csvCell(u?.name ?? ""),
        csvCell(u?.email ?? ""),
        csvCell(toNum(d.amount).toFixed(2)),
        csvCell(d.method),
        csvCell(d.txnId ?? ""),
        csvCell(d.status),
        csvCell(rev?.name ?? rev?.email ?? d.reviewedBy ?? ""),
        csvCell(d.reviewedAt ? d.reviewedAt.toISOString() : ""),
        csvCell(d.adminNote ?? ""),
      ].join(",")
    );
  }

  // UTF-8 BOM so Excel renders non-ASCII correctly on double-click.
  const csv = "﻿" + rows.join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="deposits_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
