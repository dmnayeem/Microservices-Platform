/**
 * Checks that a buyer can commission a task that actually collects something.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.script.json scripts/verify-buyer-custom-task.ts
 *
 * The case this exists for: "I need 5 Gmail accounts, $1 each." The quantity,
 * the per-completion reward and the funded budget were all already there — what
 * was missing was any way for the buyer to say WHAT they wanted back. A buyer
 * CUSTOM task stored free-text instructions and no `customConfig`, and the
 * submit route reads a config with no fields as a plain mark-done completion.
 * So the buyer paid five workers who pressed a button, and received nothing.
 *
 * Asserted here: the schema refuses a task that asks for nothing, the built
 * config is the same shape the ADMIN builder writes (so the worker runner and
 * the reviewer both read it with no buyer-specific branch), and a task written
 * with it round-trips through the database with its fields intact.
 *
 * Creates nothing it does not delete.
 */
import { prisma } from "./_q";
import {
  buyerCustomSchema,
  buildBuyerCustomConfig,
} from "../src/lib/buyer-task-configs";
import { validateCustomAnswers, type CustomConfig } from "../src/lib/custom-tasks";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${detail ? ` — ${detail}` : ""}`);
}

/** Exactly the "5 Gmail accounts" order, as the form would send it. */
const GMAIL_ORDER = {
  fields: [
    { id: "f1", type: "EMAIL" as const, label: "Gmail address", required: true },
    { id: "f2", type: "TEXT" as const, label: "Password", required: true },
    {
      id: "f3",
      type: "IMAGE" as const,
      label: "Screenshot of the inbox",
      required: true,
      maxSizeMb: 5,
    },
  ],
  introMessage: "One account per submission.",
};

async function main() {
  console.log("A task that asks for nothing is refused");
  const empty = buyerCustomSchema.safeParse({ fields: [] });
  check("no fields is rejected", !empty.success);
  const none = buyerCustomSchema.safeParse({});
  check("a missing field list is rejected", !none.success);
  const tooMany = buyerCustomSchema.safeParse({
    fields: Array.from({ length: 13 }, (_, i) => ({
      id: `f${i}`,
      type: "TEXT",
      label: `Field ${i}`,
    })),
  });
  check("more than twelve fields is rejected", !tooMany.success);
  const huge = buyerCustomSchema.safeParse({
    fields: [{ id: "f1", type: "FILE", label: "Big", maxSizeMb: 500 }],
  });
  check("an oversized upload cap is rejected", !huge.success);

  console.log("\nThe order parses and builds");
  const parsed = buyerCustomSchema.safeParse(GMAIL_ORDER);
  check("the Gmail order parses", parsed.success, parsed.success ? "" : "rejected");
  if (!parsed.success) process.exit(1);
  const cfg = buildBuyerCustomConfig(parsed.data);
  check("three fields survive", cfg.fields.length === 3, `${cfg.fields.length}`);
  check("order is stamped 0,1,2", cfg.fields.map((f) => f.order).join(",") === "0,1,2");
  check("fields default to required", cfg.fields.every((f) => f.required));
  check(
    "a buyer can never auto-approve their own task",
    cfg.autoApprove === false
  );

  console.log("\nIt is the same shape the worker runner already reads");
  // The submit route validates answers with this exact function. If a buyer
  // config were a different dialect, this is where it would show.
  const missing = validateCustomAnswers(cfg, {});
  check("an empty submission is rejected by the runner", missing !== null, missing ?? "accepted!");
  const partial = validateCustomAnswers(cfg, { f1: "someone@gmail.com" });
  check("a partial submission is rejected", partial !== null, partial ?? "accepted!");
  const complete = validateCustomAnswers(cfg, {
    f1: "someone@gmail.com",
    f2: "hunter2",
    f3: "https://cdn.example.com/inbox.png",
  });
  check("a complete submission is accepted", complete === null, complete ?? "");
  const badEmail = validateCustomAnswers(cfg, {
    f1: "not-an-email",
    f2: "hunter2",
    f3: "https://cdn.example.com/inbox.png",
  });
  check("a malformed email is caught", badEmail !== null, badEmail ?? "accepted!");

  console.log("\nDatabase round trip");
  const buyer = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] } },
    select: { id: true },
  });
  if (!buyer) {
    console.log("No account to act as the buyer.");
    process.exit(1);
  }

  // The five-accounts order, priced the way the buyer form prices it.
  const REWARD = 100; // points per completion
  const WANTED = 5;
  const task = await prisma.task.create({
    data: {
      title: "verify-buyer-custom — 5 Gmail accounts",
      description: "Created by verify-buyer-custom-task. Deleted at the end.",
      type: "CUSTOM",
      status: "PENDING_REVIEW",
      pointsReward: REWARD,
      totalLimit: WANTED,
      createdById: buyer.id,
      fundedByUserId: buyer.id,
      budgetPoints: REWARD * WANTED,
      remainingBudget: REWARD * WANTED,
      customConfig: JSON.parse(JSON.stringify(cfg)),
    },
    select: { id: true },
  });

  const back = await prisma.task.findUnique({
    where: { id: task.id },
    select: {
      customConfig: true,
      totalLimit: true,
      pointsReward: true,
      budgetPoints: true,
    },
  });
  const storedCfg = back?.customConfig as CustomConfig | null;
  check("the fields came back", (storedCfg?.fields?.length ?? 0) === 3, `${storedCfg?.fields?.length ?? 0}`);
  check("quantity is the completion limit", back?.totalLimit === WANTED, `${back?.totalLimit}`);
  check("the per-account price is the reward", back?.pointsReward === REWARD, `${back?.pointsReward}`);
  check(
    "the budget funds exactly that many",
    back?.budgetPoints === REWARD * WANTED,
    `${back?.budgetPoints} = ${REWARD} x ${WANTED}`
  );
  check(
    "the stored config still validates submissions",
    storedCfg !== null && validateCustomAnswers(storedCfg, {}) !== null
  );

  await prisma.task.delete({ where: { id: task.id } });
  check("test task removed", true);

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
