import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** Contests sit with Events in the admin (ENGAGEMENT): same permissions. */
export async function contestAdminGuard(
  need: "community.view" | "community.manage"
): Promise<{ userId: string } | { res: NextResponse }> {
  const session = await auth();
  if (!session?.user?.id) return { res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await can(session.user.id, need))) return { res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId: session.user.id };
}
