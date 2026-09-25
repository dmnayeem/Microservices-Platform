import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  calculateProfileCompletion,
  isProfileComplete,
  PHONE_VERIFICATION_AVAILABLE,
} from "@/lib/profile-completion";
import { getGateConfig, GATE_FEATURES } from "@/lib/profile-gate-server";

export const runtime = "nodejs";

/**
 * What switching the profile gate on would do, measured, before anyone does it.
 *
 * On the day this was written, 126 of 126 regular users had neither the seven
 * essentials nor a full profile — switching the gate on would have locked every
 * user out of every task at once. That is a decision an owner should make
 * knowing the number, so the settings screen shows it next to the switch.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session.user.id, "settings.view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", role: "USER" },
    select: {
      avatar: true,
      coverPhoto: true,
      firstName: true,
      lastName: true,
      bio: true,
      gender: true,
      dateOfBirth: true,
      nidNumber: true,
      emailVerified: true,
      phone: true,
      phoneVerified: true,
      country: true,
      city: true,
      street: true,
      postalCode: true,
      tags: true,
      _count: { select: { socialAccounts: true } },
    },
  });

  let essentials = 0;
  let full = 0;
  let best = 0;
  // Every user's ring percentage, so the settings screen can count who a
  // 70% or 80% bar would lock out as the admin moves it, with no round trip.
  const percentages: number[] = [];
  for (const u of users) {
    if (isProfileComplete(u)) essentials++;
    const pct = calculateProfileCompletion({
      ...u,
      socialAccountsCount: (u as unknown as { _count: { socialAccounts: number } })._count.socialAccounts,
    }).percentage;
    percentages.push(pct);
    if (pct === 100) full++;
    if (pct > best) best = pct;
  }

  const cfg = await getGateConfig();
  return NextResponse.json({
    users: users.length,
    completeEssentials: essentials,
    completeFull: full,
    bestPercentage: best,
    percentages,
    config: cfg,
    features: GATE_FEATURES,
    phoneVerificationAvailable: PHONE_VERIFICATION_AVAILABLE,
  });
}
