import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { APP_HEADER, TASK_REQUIREMENTS_CODE, type TaskNeed } from "@/lib/task-device-shared";
import { fullProfileProgress } from "@/lib/profile-completion";
import { GATE_USER_SELECT } from "@/lib/profile-gate-server";

/**
 * Per-task device requirements, set by the admin on the task form:
 *   - requireApp:  the task can only be started from the installed app
 *   - requirePush: notifications must be on (allowed on a device + not
 *                  switched off in the user's settings)
 *
 * Checked when a task is started (/api/tasks/[id]/start). A user who already
 * meets them sees nothing at all; anyone else gets 403 with
 * `code: "TASK_REQUIREMENTS"`, which the app turns into a "do this first"
 * popup (components/user/tasks/task-requirements-gate.tsx).
 *
 * "Installed app" = the request comes from the app window (the client adds
 * APP_HEADER only when running standalone, see providers/balance-sync.tsx) AND
 * this account has opened the installed app before (pwa-seen beacon). The
 * header alone would be trivially faked; the beacon alone would let a user who
 * installed once keep doing app-only tasks from a browser tab.
 */


export async function taskDeviceGate(
  request: Request,
  task: { requireApp: boolean; requirePush: boolean; requireProfile?: boolean; requireKyc?: boolean },
  userId: string
): Promise<NextResponse | null> {
  if (!task.requireApp && !task.requirePush && !task.requireProfile && !task.requireKyc) return null;

  const [user, devices] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { pwaFirstSeenAt: true, pushNotifications: true, kycStatus: true, ...GATE_USER_SELECT },
    }),
    task.requirePush ? prisma.pushSubscription.count({ where: { userId } }) : Promise.resolve(0),
  ]);
  if (!user) return null;

  const needs: TaskNeed[] = [];
  if (task.requireApp && !(request.headers.get(APP_HEADER) === "1" && user.pwaFirstSeenAt)) needs.push("app");
  if (task.requirePush && !(user.pushNotifications && devices > 0)) needs.push("push");
  // 100% profile — the same ring the profile page shows (lib/profile-completion).
  let profile: { percentage: number; missing: { label: string; href: string }[] } | null = null;
  if (task.requireProfile) {
    const socialAccountsCount = (user as unknown as { _count?: { socialAccounts?: number } })._count?.socialAccounts ?? 0;
    const p = fullProfileProgress({ ...user, socialAccountsCount }, 100);
    if (!p.complete) {
      needs.push("profile");
      profile = { percentage: p.percentage, missing: p.missing.map((m) => ({ label: m.label, href: m.href })) };
    }
  }
  if (task.requireKyc && user.kycStatus !== "APPROVED") needs.push("kyc");
  if (needs.length === 0) return null;

  const parts = needs.map((n) =>
    n === "app"
      ? "the RevType app"
      : n === "push"
        ? "notifications turned on"
        : n === "profile"
          ? "a 100% complete profile"
          : "an approved KYC (ID verification)"
  );
  return NextResponse.json(
    {
      error: `This task needs ${parts.join(" and ")}.`,
      code: TASK_REQUIREMENTS_CODE,
      needs,
      ...(profile ? { profile } : {}),
      ...(needs.includes("kyc") ? { kycStatus: user.kycStatus } : {}),
    },
    { status: 403 }
  );
}
