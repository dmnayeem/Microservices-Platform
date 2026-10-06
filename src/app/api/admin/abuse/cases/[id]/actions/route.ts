import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { abuseAccess } from "@/lib/abuse/access";
import { can } from "@/lib/permissions";
import { runAbuseAction, type ActionResult } from "@/lib/abuse/actions";
import { ACCOUNT_ACTIONS, isAbuseAction, type AbuseAction } from "@/lib/abuse/policy";

const schema = z.object({
  actions: z.array(z.string()).min(1).max(15),
  reason: z.string().max(1000).optional(),
  confirm: z.literal(true),
});

// POST /api/admin/abuse/cases/[id]/actions — run the ticked checklist.
// Each action writes its own evidence + audit row (src/lib/abuse/actions.ts).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await abuseAccess();
  if (!a.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!a.manage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const v = schema.safeParse(await req.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: "Tick at least one action and confirm." }, { status: 400 });

  const wanted = v.data.actions.filter(isAbuseAction);
  if (wanted.length === 0) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (wanted.some((x) => ACCOUNT_ACTIONS.includes(x)) && !a.account) {
    return NextResponse.json(
      { error: "Suspending, banning or restoring an account needs the “Ban / unban users” permission." },
      { status: 403 }
    );
  }
  // Releasing a held referral bonus pays points — needs the points-adjust right too.
  if (wanted.includes("release_referral_bonus") && !(await can(a.userId, "users.adjust_points"))) {
    return NextResponse.json(
      { error: "Releasing a referral bonus needs the “Adjust points” permission." },
      { status: 403 }
    );
  }

  // Evidence first: a snapshot taken after hiding would still hold the content,
  // but it would show it as already hidden.
  const ordered = [...new Set(wanted)].sort((x, y) =>
    x === "preserve_evidence" ? -1 : y === "preserve_evidence" ? 1 : 0
  );
  const results: Array<ActionResult & { action: AbuseAction }> = [];
  for (const action of ordered) {
    try {
      results.push({ action, ...(await runAbuseAction({ caseId: id, action, actorId: a.userId, reason: v.data.reason })) });
    } catch (e) {
      console.error("[abuse] action failed", action, e);
      results.push({ action, ok: false, changed: 0, message: "Failed — see the server log." });
    }
  }
  return NextResponse.json({ results });
}
