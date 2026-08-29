import { prisma } from "./_q";
import {
  getTaskViewerContext,
  visibleTaskWhere,
} from "../src/lib/task-visibility";
import { mapSocialTaskRow, type SocialTaskRow } from "../src/lib/social-tasks";

/**
 * Can a task be created, found, done, and paid?
 *
 * Read-only. This walks the lifecycle in the order a user meets it — the task
 * exists, the user can see it, the user can submit proof, someone reviews it,
 * the money moves — and asks at each step whether the DATA supports the next
 * one. A task that is ACTIVE but invisible, or whose proof requirement nobody
 * can satisfy, is not a code bug: it is a live task that quietly wastes
 * everyone's time.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/audit-task-lifecycle.ts
 */

let problems = 0;
function ok(label: string, detail?: string) {
  console.log(`  ok    ${label}${detail ? ` — ${detail}` : ""}`);
}
function bad(label: string, detail: string) {
  problems++;
  console.log(`  ISSUE ${label}\n        ${detail}`);
}
function note(label: string) {
  console.log(`  note  ${label}`);
}

async function main() {
  console.log("\n=== Task lifecycle (live data) ===\n");

  const tasks = (await prisma.task.findMany({
    select: {
      id: true, title: true, type: true, status: true, hidden: true,
      pointsReward: true, xpReward: true, dailyLimit: true, totalLimit: true,
      minLevel: true, requiredAccessLevel: true, boardId: true,
      startsAt: true, expiresAt: true, autoApprove: true, completedCount: true,
      countries: true, genders: true, minAge: true, maxAge: true,
      socialPlatform: true, socialAction: true, socialUrl: true, socialConfig: true,
      contentUrl: true, questions: true, videoConfig: true, articleConfig: true,
      createdById: true, fundedByUserId: true, remainingBudget: true,
      _count: { select: { submissions: true } },
    },
  })) as unknown as Array<{
    id: string; title: string; type: string; status: string; hidden: boolean;
    pointsReward: number; xpReward: number; dailyLimit: number | null; totalLimit: number | null;
    minLevel: number | null; requiredAccessLevel: string | null; boardId: string | null;
    startsAt: Date | null; expiresAt: Date | null; autoApprove: boolean; completedCount: number;
    countries: string[]; genders: string[]; minAge: number | null; maxAge: number | null;
    socialPlatform: string | null; socialAction: string | null; socialUrl: string | null;
    socialConfig: unknown;
    contentUrl: string | null; questions: unknown; videoConfig: unknown; articleConfig: unknown;
    createdById: string | null; fundedByUserId: string | null; remainingBudget: number;
    _count: { submissions: number };
  }>;

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const t of tasks) {
    byType[t.type] = (byType[t.type] ?? 0) + 1;
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }
  console.log(`  ${tasks.length} tasks`);
  console.log(`  by type:   ${JSON.stringify(byType)}`);
  console.log(`  by status: ${JSON.stringify(byStatus)}\n`);

  const now = new Date();
  const live = tasks.filter(
    (t) =>
      t.status === "ACTIVE" &&
      !t.hidden &&
      (!t.startsAt || t.startsAt <= now) &&
      (!t.expiresAt || t.expiresAt >= now)
  );

  /* 1. Is anything actually reachable? */
  console.log("1. Something is there to do");
  if (live.length > 0)
    ok(`${live.length} task(s) are ACTIVE, visible and inside their window`);
  else
    bad(
      "no task is currently doable",
      `${tasks.length} exist but every one is inactive, hidden, or outside its start/expiry window`
    );

  /* 2. What a real account actually sees. */
  //
  // Not a spot check against one hand-built viewer: the visibility rule is
  // per-user by design (level, plan access level, plan feature flags, and
  // STRICT audience targeting), so the only honest question is how many tasks
  // each real account can reach. An account that can see nothing has an empty
  // Tasks page and no way to earn — and nothing else in the app would say so.
  console.log("\n2. What each real account can actually see");
  const realUsers = (await prisma.user.findMany({
    where: {
      role: {
        notIn: [
          "SUPER_ADMIN", "ADMIN", "FINANCE_ADMIN", "CONTENT_ADMIN",
          "SUPPORT_ADMIN", "MARKETING_ADMIN", "MODERATOR", "AD_MANAGER",
        ],
      },
      status: "ACTIVE",
    },
    select: { id: true, email: true, level: true },
    take: 40,
  })) as unknown as Array<{ id: string; email: string; level: number }>;
  const seen: Array<{ email: string; n: number; plan: string | null }> = [];
  for (const u of realUsers) {
    const ctx = await getTaskViewerContext(u.id);
    if (!ctx || !ctx.hasTasksFeature) {
      seen.push({ email: u.email, n: -1, plan: ctx?.packageName ?? null });
      continue;
    }
    const n = await prisma.task.count({
      where: visibleTaskWhere(ctx.viewer, {
        accessLevel: ctx.accessLevel,
        allowedTypes: ctx.allowedTypes,
      }) as never,
    });
    seen.push({ email: u.email, n, plan: ctx.packageName });
  }
  const blind = seen.filter((x) => x.n === 0);
  const noFeature = seen.filter((x) => x.n === -1);
  const counts = seen.filter((x) => x.n > 0).map((x) => x.n);
  console.log(
    `  ${seen.length} active non-staff accounts — visible tasks: min=${counts.length ? Math.min(...counts) : 0} max=${counts.length ? Math.max(...counts) : 0}`
  );
  if (noFeature.length)
    note(
      `${noFeature.length} account(s) have the tasks feature switched off by their plan (${noFeature.map((x) => x.plan ?? "no plan").join(", ")})`
    );
  if (blind.length === 0)
    ok("every active account with the tasks feature can see at least one task");
  else
    bad(
      `${blind.length} active account(s) can see NO task at all`,
      blind.map((x) => `${x.email} (plan: ${x.plan ?? "none"})`).join("\n        ")
    );

  /* 3. Nothing live pays nothing. */
  console.log("\n3. Every live task pays something");
  const unpaid = live.filter((t) => t.pointsReward <= 0 && t.xpReward <= 0);
  if (unpaid.length === 0) ok("no live task offers zero points AND zero XP");
  else
    bad(
      `${unpaid.length} live task(s) pay nothing at all`,
      unpaid.map((t) => `"${t.title}" (${t.type}) pts=${t.pointsReward} xp=${t.xpReward}`).join("\n        ")
    );

  /* 4. Each type has what its own flow needs. */
  console.log("\n4. Each live task has the fields its type needs to be doable");
  // Each branch asks what the PLAYER reads, not what the column is called.
  // `contentUrl` alone is not the answer: a VIDEO task plays
  // `videoConfig.videoUrl || contentUrl`, an ARTICLE task runs off
  // `articleConfig.pages` in key-pool mode, and a QUIZ with no stored questions
  // falls back to Gemini generation. Checking the column would have reported
  // 32 working tasks as broken.
  const geminiConfigured = !!process.env.GEMINI_API_KEY;
  const broken: string[] = [];
  for (const t of live) {
    const missing: string[] = [];
    if (t.type === "SOCIAL") {
      // Judged by `mapSocialTaskRow`, the same mapper the run view uses — not
      // by the legacy columns. A v1 task keeps its action on those columns with
      // a null `socialConfig` and the mapper synthesizes a one-item bundle from
      // them; a v2 CREATE_PIN keeps its target in `fields.destinationUrl` and
      // leaves `socialUrl` empty. Checking the columns flagged ten working
      // tasks, several with real submissions on them.
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
      const first = view.items[0];
      const hasTarget =
        !!first &&
        (!!first.targetUrl?.trim() ||
          Object.values(first.fields ?? {}).some(
            (v) => typeof v === "string" && v.trim()
          ));
      if (!first) missing.push("any action at all");
      else if (!hasTarget) missing.push("a target URL / handle for its first action");
    }
    if (t.type === "VIDEO") {
      const cfg = t.videoConfig as { videoUrl?: string } | null;
      if (!cfg?.videoUrl && !t.contentUrl) missing.push("a video URL");
    }
    if (t.type === "ARTICLE") {
      const cfg = t.articleConfig as
        | { useKeyPool?: boolean; pages?: Array<{ url?: string }>; links?: Array<{ url?: string }> }
        | null;
      const hasPages = (cfg?.pages ?? []).some((p) => p?.url);
      const hasLinks = (cfg?.links ?? []).some((l) => l?.url);
      if (!hasPages && !hasLinks && !t.contentUrl) missing.push("an article URL");
    }
    if (t.type === "QUIZ") {
      const qs = t.questions as unknown[] | null;
      const stored = Array.isArray(qs) && qs.length > 0;
      // No stored questions is fine ONLY while AI generation can stand in.
      if (!stored && !geminiConfigured)
        missing.push("questions (and GEMINI_API_KEY is unset, so none can be generated)");
    }
    if (missing.length) broken.push(`"${t.title}" (${t.type}) missing ${missing.join(", ")}`);
  }
  if (broken.length === 0)
    ok("every live task carries the URL / questions / platform its flow reads");
  else
    bad(
      `${broken.length} live task(s) cannot be completed as configured`,
      broken.slice(0, 15).join("\n        ")
    );

  /* 5. Limits that make a task impossible. */
  console.log("\n5. No live task is capped out of existence");
  const capped = live.filter(
    (t) =>
      (t.totalLimit != null && t.totalLimit > 0 && t.completedCount >= t.totalLimit) ||
      (t.dailyLimit != null && t.dailyLimit <= 0) ||
      (t.totalLimit != null && t.totalLimit < 0)
  );
  if (capped.length === 0) ok("no live task is already at or past its own limit");
  else
    bad(
      `${capped.length} live task(s) are still ACTIVE but can never be claimed`,
      capped.map((t) => `"${t.title}" completed=${t.completedCount} totalLimit=${t.totalLimit} dailyLimit=${t.dailyLimit}`).join("\n        ")
    );

  /* 6. Targeting that excludes everyone. */
  console.log("\n6. Targeting does not exclude every account");
  const users = (await prisma.user.findMany({
    select: { country: true, gender: true, dateOfBirth: true, level: true },
  })) as unknown as Array<{ country: string | null; gender: string | null; dateOfBirth: Date | null; level: number }>;
  const impossible: string[] = [];
  for (const t of live) {
    const reach = users.filter((u) => {
      if (t.countries?.length && !(u.country && t.countries.includes(u.country))) return false;
      if (t.genders?.length && !(u.gender && t.genders.includes(u.gender))) return false;
      if (t.minLevel != null && u.level < t.minLevel) return false;
      if (t.minAge != null || t.maxAge != null) {
        if (!u.dateOfBirth) return false;
        const age = Math.floor((Date.now() - u.dateOfBirth.getTime()) / 31557600000);
        if (t.minAge != null && age < t.minAge) return false;
        if (t.maxAge != null && age > t.maxAge) return false;
      }
      return true;
    }).length;
    if (reach === 0)
      impossible.push(
        `"${t.title}" countries=${JSON.stringify(t.countries)} genders=${JSON.stringify(t.genders)} minLevel=${t.minLevel} age=${t.minAge}-${t.maxAge}`
      );
  }
  if (impossible.length === 0)
    ok(`every live task is reachable by at least one of the ${users.length} accounts`);
  else
    bad(
      `${impossible.length} live task(s) target nobody who exists`,
      impossible.slice(0, 12).join("\n        ")
    );

  /* 7. Submissions are not stuck. */
  console.log("\n7. Delivered work gets a decision");
  const subs = (await prisma.taskSubmission.findMany({
    select: { id: true, status: true, createdAt: true, submittedAt: true, reviewedAt: true, task: { select: { title: true, autoApprove: true } } },
  })) as unknown as Array<{ id: string; status: string; createdAt: Date; submittedAt: Date | null; reviewedAt: Date | null; task: { title: string; autoApprove: boolean } | null }>;
  const sByStatus: Record<string, number> = {};
  for (const s of subs) sByStatus[s.status] = (sByStatus[s.status] ?? 0) + 1;
  console.log(`  ${subs.length} submissions: ${JSON.stringify(sByStatus)}`);
  const DAY = 86400000;
  // `/start` writes a PENDING row the moment a user opens a task, so PENDING
  // alone is not a review backlog — most of these were opened and abandoned and
  // there is nothing to look at. Only a row with `submittedAt` is work waiting
  // on a human, and that is the only number worth alarming about.
  const waiting = subs.filter((s) => s.status === "PENDING" && s.submittedAt);
  const abandoned = subs.filter((s) => s.status === "PENDING" && !s.submittedAt);
  console.log(
    `  ${waiting.length} submitted and waiting for review · ${abandoned.length} opened but never submitted`
  );
  const stale = waiting.filter(
    (s) => Date.now() - (s.submittedAt as Date).getTime() > 7 * DAY
  );
  if (stale.length === 0) ok("nothing submitted has waited more than 7 days for review");
  else
    bad(
      `${stale.length} submission(s) have waited over 7 days for a decision`,
      stale
        .slice(0, 8)
        .map(
          (s) =>
            `"${s.task?.title ?? "?"}" submitted ${Math.floor((Date.now() - (s.submittedAt as Date).getTime()) / DAY)}d ago`
        )
        .join("\n        ")
    );
  if (abandoned.length)
    note(
      `${abandoned.length} task(s) were opened and never submitted — harmless, but they inflate any PENDING count that does not filter on submittedAt`
    );

  /* 8. Decided submissions carry the decision. */
  console.log("\n8. A decided submission records when it was decided");
  const decidedNoStamp = subs.filter(
    (s) => ["APPROVED", "REJECTED"].includes(s.status) && !s.reviewedAt
  );
  if (decidedNoStamp.length === 0)
    ok("every manually APPROVED/REJECTED submission has a reviewedAt");
  else
    bad(
      `${decidedNoStamp.length} decided submission(s) have no reviewedAt`,
      `an admin decision with no timestamp cannot be audited later — e.g. ${decidedNoStamp.slice(0, 5).map((s) => `${s.id} ${s.status}`).join(", ")}`
    );

  /* 9. Orphans. */
  console.log("\n9. No orphan rows");
  const orphanSubs = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM "TaskSubmission" s
      WHERE NOT EXISTS (SELECT 1 FROM "Task" t WHERE t.id = s."taskId")
         OR NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = s."userId")`
  )) as Array<{ c: number }>;
  const orphanTasks = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM "Task" t
      WHERE t."boardId" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM "TaskBoard" b WHERE b.id = t."boardId")`
  )) as Array<{ c: number }>;
  if (orphanSubs[0].c === 0 && orphanTasks[0].c === 0)
    ok("every submission points at a real task and a real user; every board task at a real board");
  else
    bad(
      "orphan rows exist",
      `submissions with a missing task/user: ${orphanSubs[0].c}, tasks on a missing board: ${orphanTasks[0].c}`
    );

  console.log(
    `\n${problems === 0 ? "No task-lifecycle issues found." : `${problems} issue area(s) found.`}\n`
  );
  process.exit(0);
}
main();
