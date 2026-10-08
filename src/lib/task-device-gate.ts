import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { APP_HEADER, TASK_REQUIREMENTS_CODE, type TaskNeed } from "@/lib/task-device-shared";

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
  task: { requireApp: boolean; requirePush: boolean },
  userId: string
): Promise<NextResponse | null> {
  if (!task.requireApp && !task.requirePush) return null;

  const [user, devices] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { pwaFirstSeenAt: true, pushNotifications: true } }),
    task.requirePush ? prisma.pushSubscription.count({ where: { userId } }) : Promise.resolve(0),
  ]);
  if (!user) return null;

  const needs: TaskNeed[] = [];
  if (task.requireApp && !(request.headers.get(APP_HEADER) === "1" && user.pwaFirstSeenAt)) needs.push("app");
  if (task.requirePush && !(user.pushNotifications && devices > 0)) needs.push("push");
  if (needs.length === 0) return null;

  const what =
    needs.length === 2
      ? "the RevType app with notifications turned on"
      : needs[0] === "app"
        ? "the RevType app"
        : "notifications turned on";
  return NextResponse.json(
    { error: `This task can only be done from ${what}.`, code: TASK_REQUIREMENTS_CODE, needs },
    { status: 403 }
  );
}
