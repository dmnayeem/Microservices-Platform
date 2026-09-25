import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { verifyAppealToken } from "@/lib/fraud-risk";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().max(500).optional(),
  message: z.string().trim().min(20, "Please explain in at least 20 characters").max(3000),
});

/**
 * POST /api/auth/appeal — a suspended user asks to be let back in.
 *
 * Under /api/auth because a suspended account has no usable session: identity
 * is the signed token from the login screen or the suspension email. A session
 * is accepted too, for someone suspended while signed in.
 */
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, "suspension-appeal", 5, 60 * 60_000);
  if (limited) return limited;

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const userId = verifyAppealToken(parsed.data.token) ?? (await auth())?.user?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: "This appeal link has expired. Sign in again to get a new one." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, fraudRisk: true, suspendedReason: true },
  });
  if (!user || user.status !== "SUSPENDED") {
    return NextResponse.json({ error: "This account is not suspended." }, { status: 400 });
  }

  // One open appeal at a time — a second one would only queue behind the first.
  const open = await prisma.suspensionAppeal.findFirst({
    where: { userId, status: "PENDING" },
    select: { id: true },
  });
  if (open) {
    return NextResponse.json({ error: "You already have an appeal waiting for review." }, { status: 409 });
  }

  const appeal = await prisma.suspensionAppeal.create({
    data: {
      userId,
      message: parsed.data.message,
      riskAtAppeal: user.fraudRisk,
      reasonAtAppeal: user.suspendedReason,
    },
    select: { id: true, createdAt: true },
  });
  return NextResponse.json({ ok: true, appeal }, { status: 201 });
}
