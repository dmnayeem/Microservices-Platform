import { usd } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { grantAdCredits } from "@/lib/ad-credits";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  userId: z.string().optional(),
  email: z.string().optional(),
  amountUsd: z.number().refine((n) => n !== 0, "Non-zero amount required"),
  note: z.string().max(200).optional(),
});

// POST /api/admin/ads/credits — grant (or adjust, if negative) a user's ad credit.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !(await can(session.user.id, "ads.manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const v = schema.safeParse(await request.json().catch(() => ({})));
  if (!v.success) {
    return NextResponse.json({ error: v.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  let userId = v.data.userId;
  if (!userId && v.data.email) {
    const u = await prisma.user.findFirst({
      where: { email: v.data.email.trim() },
      select: { id: true },
    });
    if (!u) return NextResponse.json({ error: "No user with that email" }, { status: 404 });
    userId = u.id;
  }
  if (!userId) {
    return NextResponse.json({ error: "userId or email required" }, { status: 400 });
  }

  const r = await grantAdCredits({
    userId,
    amountUsd: v.data.amountUsd,
    adminId: session.user.id,
    note: v.data.note,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });

  // This moves money and had no audit trail at all — only the ledger row's
  // metadata recorded which admin did it.
  await writeAudit({
    actorId: session.user.id,
    action: "AD_CREDIT_GRANTED",
    entity: "User",
    entityId: userId,
    targetUserId: userId,
    summary: `${v.data.amountUsd >= 0 ? "Granted" : "Deducted"} ${usd(Math.abs(v.data.amountUsd))} ad credit`,
    meta: { amountUsd: v.data.amountUsd, note: v.data.note ?? null, balance: r.adCreditBalance },
  });

  return NextResponse.json({ adCreditBalance: r.adCreditBalance });
}
