import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceDbRateLimit } from "@/lib/rate-limit-db";

// GET /api/profile/export — "Download My Data" on the profile page. The button
// linked here and got a 404. Returns the signed-in user's own records as a
// JSON file. Explicit selects only: no password hash, 2FA secret or tokens,
// and nothing staff-only (admin notes, reviewer ids).
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const limited = await enforceDbRateLimit(request, "profile-export", userId, 3, 60 * 60_000);
  if (limited) return limited;

  const [profile, transactions, withdrawals, deposits, submissions, posts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, emailVerified: true, phone: true, name: true,
        firstName: true, lastName: true, username: true, avatar: true, bio: true,
        gender: true, dateOfBirth: true, country: true, division: true,
        district: true, subDistrict: true, city: true, language: true,
        timezone: true, pointsBalance: true, cashBalance: true, xp: true,
        level: true, kycStatus: true, referralCode: true, createdAt: true,
      },
    }),
    prisma.transaction.findMany({
      where: { userId },
      select: { type: true, status: true, points: true, amount: true, description: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.withdrawal.findMany({
      where: { userId },
      select: { amount: true, fee: true, netAmount: true, method: true, status: true, rejectionReason: true, createdAt: true, processedAt: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.deposit.findMany({
      where: { userId },
      select: { amount: true, method: true, status: true, createdAt: true, reviewedAt: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    prisma.taskSubmission.findMany({
      where: { userId },
      select: { taskId: true, status: true, pointsEarned: true, createdAt: true, submittedAt: true, reviewedAt: true, task: { select: { title: true, type: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.post.findMany({
      where: { userId },
      select: { id: true, content: true, images: true, isPublic: true, likesCount: true, commentsCount: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
  ]);

  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), profile, transactions, withdrawals, deposits, taskSubmissions: submissions, posts },
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    2
  );
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-data-${day}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
