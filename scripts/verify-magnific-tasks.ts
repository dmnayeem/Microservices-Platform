/**
 * End-to-end check of the `magnific-tasks` scheduler sweep.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-magnific-tasks.ts
 *
 * The sweep is model-agnostic — it polls whatever feature a listing parked —
 * so this exercises it with a cheap ASYNC IMAGE task instead of a video. Same
 * code path, a fraction of the credits.
 *
 * It also covers the three cases that would be expensive to discover in
 * production: a listing with no parked task must be left alone (those are real
 * sellers awaiting review), a task past its deadline must be failed with a
 * readable reason rather than retried against a dead link, and a second sweep
 * over the same listing must not write it twice.
 *
 * Costs one image generation. Everything it creates, it deletes.
 */
import { prisma } from "./_q";
import { startTask, getTask } from "../src/lib/magnific";
import { settleMagnificTasks, readParkedTask, summariseSweep } from "../src/lib/marketplace-studio-tasks";
import { TASK_RESULT_TTL_MS } from "../src/lib/marketplace-studio";
import { SCHEDULED_JOBS } from "../src/lib/scheduler/jobs";
import { ownMediaKey } from "../src/lib/media-url";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("Registration");
  const job = SCHEDULED_JOBS.find((j) => j.name === "magnific-tasks");
  check("job is registered", !!job);
  check("lease does not outlast its window", !!job && job.leaseMs <= job.intervalMs);
  check(
    "polls often enough for the result deadline",
    !!job && job.intervalMs < TASK_RESULT_TTL_MS / 10,
    job ? `${job.intervalMs / 60000}min vs ${TASK_RESULT_TTL_MS / 60000}min budget` : ""
  );

  const seller = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true },
  });
  if (!seller) {
    console.log("No admin account to own test listings.");
    process.exit(1);
  }

  const made: string[] = [];
  const mk = (title: string, details: Record<string, unknown>, files: string[] = []) =>
    prisma.marketplaceListing.create({
      data: {
        sellerId: seller.id,
        title,
        description: "Created by verify-magnific-tasks. Deleted at the end of the run.",
        category: "Stock photo",
        assetType: "STOCK_PHOTO",
        details: JSON.parse(JSON.stringify(details)),
        price: 1,
        images: [],
        files,
        status: "PENDING_REVIEW",
      },
      select: { id: true },
    });

  console.log("\nStarting a real async task");
  const started = await startTask("fluxDev", {
    prompt: "a plain matte ceramic bowl on a pale linen cloth, soft daylight",
  });
  check("task accepted", started.success, started.success ? started.data.task_id : started.error);
  if (!started.success) process.exit(1);
  const taskId = started.data.task_id;

  const live = await mk("Verify task — live", {
    license: "Standard (royalty-free)",
    magnificTaskId: taskId,
    magnificFeature: "fluxDev",
    magnificExpiresAt: new Date(Date.now() + TASK_RESULT_TTL_MS).toISOString(),
    magnificPrompt: "ceramic bowl",
  });
  made.push(live.id);

  // A seller's listing: same status, same empty files, no parked task.
  const untouched = await mk("Verify task — a real seller's listing", {
    license: "Standard (royalty-free)",
  });
  made.push(untouched.id);

  // A task whose result link has already lapsed.
  const stale = await mk("Verify task — past its deadline", {
    license: "Standard (royalty-free)",
    magnificTaskId: taskId,
    magnificFeature: "fluxDev",
    magnificExpiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  made.push(stale.id);

  console.log("\nParked-task parsing");
  check("a parked task is recognised", readParkedTask({ magnificTaskId: taskId, magnificFeature: "fluxDev", magnificExpiresAt: new Date().toISOString() }) !== null);
  check("a plain seller listing is not", readParkedTask({ license: "Standard (royalty-free)" }) === null);
  check("an unknown feature is rejected", readParkedTask({ magnificTaskId: "x", magnificFeature: "nope", magnificExpiresAt: new Date().toISOString() }) === null);

  console.log("\nWaiting for the generation to finish");
  let state = await getTask("fluxDev", taskId);
  for (let i = 0; i < 40 && state.success && state.data.status !== "COMPLETED" && state.data.status !== "FAILED"; i++) {
    await sleep(3000);
    state = await getTask("fluxDev", taskId);
  }
  check(
    "task reached a terminal state",
    state.success && (state.data.status === "COMPLETED" || state.data.status === "FAILED"),
    state.success ? state.data.status : state.error
  );

  console.log("\nSweep");
  const s1 = await settleMagnificTasks({ limit: 10 });
  console.log(`      ${summariseSweep(s1)}`);
  check("the sweep reported work", s1.examined >= 2, `examined ${s1.examined}`);

  const after = await prisma.marketplaceListing.findUnique({
    where: { id: live.id },
    select: { files: true, images: true, details: true, status: true },
  });
  check("deliverable attached", (after?.files.length ?? 0) === 1, after?.files[0] ?? "none");
  check(
    "deliverable is NOT publicly proxied",
    !!after?.files[0] && ownMediaKey(after.files[0]) === null
  );
  check("parked task cleared", readParkedTask(after?.details) === null);
  check("still awaiting the admin's approval", after?.status === "PENDING_REVIEW", after?.status ?? "");

  const untouchedAfter = await prisma.marketplaceListing.findUnique({
    where: { id: untouched.id },
    select: { files: true, status: true, rejectionReason: true },
  });
  check(
    "a real seller's listing was left alone",
    untouchedAfter?.status === "PENDING_REVIEW" &&
      untouchedAfter.files.length === 0 &&
      untouchedAfter.rejectionReason === null
  );

  const staleAfter = await prisma.marketplaceListing.findUnique({
    where: { id: stale.id },
    select: { status: true, rejectionReason: true, files: true },
  });
  check("an expired task is failed, not retried", staleAfter?.status === "REJECTED", staleAfter?.status ?? "");
  check(
    "the reason says the credits were spent",
    !!staleAfter?.rejectionReason && /credits were spent/i.test(staleAfter.rejectionReason),
    staleAfter?.rejectionReason ?? "none"
  );
  check("no file was attached to the expired one", (staleAfter?.files.length ?? 0) === 0);

  console.log("\nSecond sweep (must be a no-op)");
  const before = JSON.stringify(after?.files);
  const s2 = await settleMagnificTasks({ limit: 10 });
  console.log(`      ${summariseSweep(s2)}`);
  const afterTwice = await prisma.marketplaceListing.findUnique({
    where: { id: live.id },
    select: { files: true },
  });
  check("running twice changed nothing", JSON.stringify(afterTwice?.files) === before);
  check("nothing was settled a second time", s2.completed === 0, `completed ${s2.completed}`);

  console.log("\nCleanup");
  await prisma.marketplaceListing.deleteMany({ where: { id: { in: made } } });
  check("test rows removed", true);

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
