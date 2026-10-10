import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classifyTouch } from "@/lib/signup-source";
import type { FirstTouch } from "@/lib/signup-source-shared";

// POST /api/me/signup-source — the browser's saved first touch, sent once after
// sign-up (components/providers/first-touch.tsx). Stored only on a NEW account
// with no source yet, and only when the touch was captured before the account
// existed: a touch from after sign-up says nothing about how they found us.
const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SLACK_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const touch = (await request.json().catch(() => null)) as Partial<FirstTouch> | null;
  if (!touch || typeof touch !== "object") return NextResponse.json({ ok: true, saved: false });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { createdAt: true, signupSource: true },
  });
  if (!user || user.signupSource) return NextResponse.json({ ok: true, saved: false });

  const created = user.createdAt.getTime();
  const at = typeof touch.at === "number" ? touch.at : NaN;
  const fresh = Date.now() - created < NEW_ACCOUNT_MS;
  const beforeSignup = Number.isFinite(at) && at <= created + CLOCK_SLACK_MS;
  if (!fresh || !beforeSignup) return NextResponse.json({ ok: true, saved: false });

  const s = classifyTouch(touch);
  // Only if still empty — two tabs reporting at once write once.
  await prisma.user.updateMany({
    where: { id: session.user.id, signupSource: null },
    data: {
      signupSource: s.source,
      signupMedium: s.medium,
      signupCampaign: s.campaign,
      signupReferrer: s.referrer,
      signupLanding: s.landing,
    },
  });
  return NextResponse.json({ ok: true, saved: true });
}
