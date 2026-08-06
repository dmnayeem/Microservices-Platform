import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(session.user.id, "referrals.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Top 1000 referrers
  const referrers = await prisma.user.findMany({
    where: { referrals: { some: {} } },
    orderBy: { referrals: { _count: "desc" } },
    take: 1000,
    include: { package: { select: { slug: true, name: true } } },
  });

  const ids = referrers.map((u) => u.id);
  const counts = await Promise.all(
    ids.map((id) => prisma.user.count({ where: { referredById: id } }))
  );
  const earningsList = await Promise.all(
    ids.map((id) =>
      prisma.referralEarning.aggregate({
        where: { userId: id },
        _sum: { amount: true },
      })
    )
  );
  const earningsMap = new Map(
    ids.map((id, i) => [id, earningsList[i]._sum.amount ?? 0])
  );

  const header = [
    "Rank",
    "User ID",
    "Name",
    "Email",
    "Referral Code",
    "Total Referrals",
    "Total Earnings (USD)",
    "Package Tier",
    "Country",
    "Joined At",
  ].join(",");

  const escape = (s: string | null | undefined) => {
    if (s === null || s === undefined) return "";
    const v = String(s).replace(/"/g, '""');
    return /[,"\n]/.test(v) ? `"${v}"` : v;
  };

  type UserWithPkg = (typeof referrers)[number] & {
    package: { slug: string; name: string } | null;
  };
  const rows = (referrers as unknown as UserWithPkg[]).map((u, i) =>
    [
      i + 1,
      escape(u.id),
      escape(u.name),
      escape(u.email),
      escape(u.referralCode),
      counts[i] ?? 0,
      (earningsMap.get(u.id) ?? 0).toFixed(2),
      escape(u.package?.name ?? ""),
      escape(u.country),
      u.createdAt.toISOString(),
    ].join(",")
  );

  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="referrals_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
