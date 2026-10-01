import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";

/**
 * Who may do what in the Abuse Center.
 *  view    fraud.view                    see cases and evidence
 *  manage  fraud.manage OR users.edit    notes, status, content/ads/tasks/withdrawal actions
 *  account users.ban (plus manage)       suspend / ban / restore an account — the
 *                                        same permission the ban route asks for
 */
export async function abuseAccess() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { userId: null, view: false, manage: false, account: false };
  const [view, fm, ue, ban] = await Promise.all([
    can(userId, "fraud.view"),
    can(userId, "fraud.manage"),
    can(userId, "users.edit"),
    can(userId, "users.ban"),
  ]);
  const manage = fm || ue;
  return { userId, view: view || manage, manage, account: manage && ban };
}
