import { prisma } from "./_q";
import { taskCompletabilityError } from "../src/lib/task-completability";
import { mapSocialTaskRow, type SocialTaskRow } from "../src/lib/social-tasks";

/**
 * Repair the data the launch audit found, and nothing else.
 *
 * Every fix here has a matching code change that stops it recurring — this
 * script only cleans up what was already written before those gates existed:
 *
 *   1. Live tasks nobody can finish   → PAUSED (see lib/task-completability.ts)
 *   2. Live tasks already at their cap → COMPLETED (see lib/task-slots.ts)
 *   3. totalEarnings that disagrees with the ledger → resynced to the ledger
 *   4. Decided submissions with no reviewedAt → stamped from updatedAt
 *
 * DRY RUN BY DEFAULT. Pass --apply to write. Nothing is deleted, no balance is
 * touched, and tasks are paused rather than removed so the owner can fix and
 * republish them.
 *
 *   npx tsx --tsconfig tsconfig.script.json scripts/repair-launch-data.ts
 *   npx tsx --tsconfig tsconfig.script.json scripts/repair-launch-data.ts --apply
 */

const APPLY = process.argv.includes("--apply");

/**
 * A SOCIAL task is judged by the mapper the PLAYER uses, not by the bundle
 * validator and not by the legacy columns.
 *
 * Two false alarms taught this. `validateSocialBundle` rejects a v1 task whose
 * action lives on `socialPlatform`/`socialAction`/`socialUrl` with a null
 * `socialConfig` — but `mapSocialTaskRow` synthesizes a one-item bundle from
 * exactly those columns, so the run view shows the action and the submit bar and
 * the task works. And requiring `socialUrl` rejects a v2 CREATE_PIN task whose
 * target is `fields.destinationUrl`. Both were live tasks with real submissions.
 *
 * What actually breaks a social task is having no action to point the user at:
 * no item, or a first item with no target of any kind.
 */
function socialProblem(t: {
  type: string;
  id: string;
  title: string;
  pointsReward: number;
  socialPlatform: string | null;
  socialAction: string | null;
  socialUrl: string | null;
  socialConfig: unknown;
}): string | null {
  if (t.type !== "SOCIAL") return null;
  const view = mapSocialTaskRow({
    id: t.id,
    title: t.title,
    description: null,
    pointsReward: t.pointsReward,
    difficulty: null,
    socialPlatform: t.socialPlatform,
    socialAction: t.socialAction,
    socialUrl: t.socialUrl,
    socialConfig: t.socialConfig,
    instructions: null,
    instructionVideoUrl: null,
  } as SocialTaskRow);
  if (view.items.length === 0) return "A social task needs at least one action.";
  const first = view.items[0];
  const hasTarget =
    !!first.targetUrl?.trim() ||
    Object.values(first.fields ?? {}).some(
      (v) => typeof v === "string" && v.trim()
    );
  if (!hasTarget)
    return "A social task needs a target — a URL, handle or destination for its first action.";
  return null;
}
const geminiConfigured = !!process.env.GEMINI_API_KEY;

function head(s: string) {
  console.log(`\n${s}`);
}

async function main() {
  console.log(
    `\n=== Launch data repair — ${APPLY ? "APPLYING" : "DRY RUN (pass --apply to write)"} ===`
  );

  /* 1. Unfinishable live tasks. */
  head("1. Live tasks a user cannot finish");
  const live = (await prisma.task.findMany({
    where: { status: "ACTIVE", hidden: false },
    select: {
      id: true, title: true, type: true, pointsReward: true, xpReward: true,
      contentUrl: true, questions: true, videoConfig: true, articleConfig: true,
      socialConfig: true, socialPlatform: true, socialAction: true, socialUrl: true,
      _count: { select: { submissions: true } },
    },
  })) as unknown as Array<{
    id: string; title: string; type: string; pointsReward: number; xpReward: number;
    contentUrl: string | null; questions: unknown; videoConfig: unknown; articleConfig: unknown;
    socialConfig: unknown; socialPlatform: string | null;
    socialAction: string | null; socialUrl: string | null;
    _count: { submissions: number };
  }>;

  const unfinishable = live
    .map((t) => ({
      t,
      why:
        taskCompletabilityError(t, { aiQuizAvailable: geminiConfigured }) ??
        socialProblem(t),
    }))
    .filter((x) => x.why);

  if (unfinishable.length === 0) console.log("  nothing to do");
  for (const { t, why } of unfinishable) {
    console.log(
      `  ${APPLY ? "PAUSE " : "would pause"} "${t.title}" (${t.type}, ${t._count.submissions} submissions) — ${why}`
    );
  }
  if (APPLY && unfinishable.length) {
    await prisma.task.updateMany({
      where: { id: { in: unfinishable.map((x) => x.t.id) }, status: "ACTIVE" },
      data: { status: "PAUSED" },
    });
  }

  /* 2. Tasks that are full but still ACTIVE. */
  head("2. Live tasks already at their global limit");
  const full = (await prisma.$queryRawUnsafe(
    `SELECT id, title, "completedCount", "totalLimit"
       FROM "Task"
      WHERE status = 'ACTIVE' AND "totalLimit" IS NOT NULL AND "totalLimit" > 0
        AND "completedCount" >= "totalLimit"`
  )) as Array<{ id: string; title: string; completedCount: number; totalLimit: number }>;
  if (full.length === 0) console.log("  nothing to do");
  for (const t of full)
    console.log(
      `  ${APPLY ? "CLOSE " : "would close"} "${t.title}" (${t.completedCount}/${t.totalLimit})`
    );
  if (APPLY && full.length) {
    await prisma.task.updateMany({
      where: { id: { in: full.map((t) => t.id) }, status: "ACTIVE" },
      data: { status: "COMPLETED" },
    });
  }

  /* 3. totalEarnings vs the ledger. */
  head("3. totalEarnings that disagrees with the ledger");
  // The ledger is authoritative: it is the row-by-row record of every credit,
  // and it is what the finance console reconciles against. `totalEarnings` is a
  // cached sum used for display and for leaderboard ordering, so bringing it
  // back in line changes no balance and nobody's spendable money.
  const drift = (await prisma.$queryRawUnsafe(
    `SELECT u.id, u.email, u."totalEarnings"::float8 AS stored,
            COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'COMPLETED' AND t.type IN
              ('EARNING','BONUS','REFERRAL','LOTTERY_WIN','CHECKIN','AFFILIATE_COMMISSION','COURSE_TUTOR_EARNING','GIFT')), 0)::float8 AS ledger
       FROM "User" u LEFT JOIN "Transaction" t ON t."userId" = u.id
      GROUP BY u.id, u.email, u."totalEarnings"
      HAVING ABS(u."totalEarnings"::float8 - COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'COMPLETED' AND t.type IN
              ('EARNING','BONUS','REFERRAL','LOTTERY_WIN','CHECKIN','AFFILIATE_COMMISSION','COURSE_TUTOR_EARNING','GIFT')), 0)::float8) > 0.005
      ORDER BY 3 DESC`
  )) as Array<{ id: string; email: string; stored: number; ledger: number }>;
  if (drift.length === 0) console.log("  nothing to do");
  for (const d of drift)
    console.log(
      `  ${APPLY ? "SET   " : "would set"} ${d.email.padEnd(32)} $${d.stored.toFixed(4)} -> $${d.ledger.toFixed(4)}`
    );
  if (APPLY) {
    for (const d of drift) {
      await prisma.user.update({
        where: { id: d.id },
        data: { totalEarnings: d.ledger },
      });
    }
  }

  /* 4. Decided submissions with no decision timestamp. */
  head("4. Decided submissions with no reviewedAt");
  const undated = (await prisma.taskSubmission.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] }, reviewedAt: null },
    select: { id: true, status: true, updatedAt: true },
  })) as unknown as Array<{ id: string; status: string; updatedAt: Date }>;
  if (undated.length === 0) console.log("  nothing to do");
  for (const s of undated)
    console.log(
      `  ${APPLY ? "STAMP " : "would stamp"} ${s.id} ${s.status} -> ${s.updatedAt.toISOString()}`
    );
  if (APPLY) {
    for (const s of undated) {
      await prisma.taskSubmission.update({
        where: { id: s.id },
        data: { reviewedAt: s.updatedAt },
      });
    }
  }

  console.log(
    `\n${APPLY ? "Applied." : "Dry run only — nothing was written."}\n`
  );
  process.exit(0);
}
main();
