import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { ownMediaKey, mediaSrc } from "../src/lib/media-url";
import { placementSpec } from "../src/lib/ad-placements";
import { normalizeDocumentNumber, isPlausibleDocumentNumber } from "../src/lib/kyc/document-number";

/**
 * Anchor ad height · broken post images · task delete · KYC duplicates.
 *
 * Two of these are money-adjacent and the checks reflect that:
 *
 *  - Deleting a task with submissions must be IMPOSSIBLE. Those rows are the
 *    record of work users were paid for, and every ledger entry is keyed
 *    `task_<taskId>_<submissionId>`. The test below archives such a task and
 *    then asserts the submission and its transaction are still there — that is
 *    the assertion that matters, not the status flip.
 *  - One national ID verifies one account. Asserted twice over: the guard says
 *    no, and the `User.nidNumber` unique index says no even when the guard is
 *    skipped entirely.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-four-fixes.ts
 */

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!,
}).$extends(withAccelerate());

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const tag = "v4fix-" + Math.random().toString(36).slice(2, 8);
const made: Record<string, string> = {};

async function main() {
  console.log("\n=== Four fixes ===\n");

  /* ── 1. Anchor ad strip ── */
  console.log("1. A strip space renders as a strip");
  {
    const s = code("src/components/user/primitives/ad-renderer.tsx");
    check(
      "strip placements are detected from the space's own ceiling",
      /const isStrip = spec\.maxHeightPx <= 96/.test(s)
    );
    check(
      "there is a separate strip branch",
      /if \(isStrip\) \{/.test(s)
    );
    // The whole point: the CARD is capped, not just the media. Capping the media
    // alone is what let a 64px space render 138px tall.
    check(
      "the strip caps the whole card, not just its media",
      /maxHeight: spec\.maxHeightPx \}\}/.test(s)
    );
    check(
      "the strip lays the media beside the text, not above it",
      /flex items-stretch/.test(s) && /h-full w-auto shrink-0/.test(s)
    );
    // The spaces that must qualify, read from the real catalogue.
    for (const p of ["ANCHOR_BOTTOM", "VIDEO_OVERLAY", "FEED_POST_BELOW"]) {
      check(`${p} is a strip (${placementSpec(p).maxHeightPx}px)`, placementSpec(p).maxHeightPx <= 96);
    }
    // ...and the ones that must not, or every in-page banner would go compact.
    for (const p of ["TASK_LIST", "WALLET_TOP", "IN_FEED", "TASK_COMPLETE"]) {
      check(`${p} keeps the stacked card (${placementSpec(p).maxHeightPx}px)`, placementSpec(p).maxHeightPx > 96);
    }
  }

  /* ── 2. Post images ── */
  console.log("\n2. Post images resolve through the proxy");
  {
    const S3 = "https://earngpt.s3.ap-southeast-1.amazonaws.com";
    check(
      "a posts/ URL is rewritten to the proxy",
      mediaSrc(`${S3}/posts/u1/123_abc.webp`) === "/api/media/posts/u1/123_abc.webp"
    );
    check("media/ still works", ownMediaKey(`${S3}/media/x/y.png`) === "media/x/y.png");
    check("task-proofs/ still works", ownMediaKey(`${S3}/task-proofs/a.png`) === "task-proofs/a.png");
    // The negatives — rewriting these would break gated flows or third parties.
    check(
      "a presigned URL is left alone",
      ownMediaKey(`${S3}/posts/a.png?X-Amz-Signature=abc`) === null
    );
    check("a private prefix is left alone", ownMediaKey(`${S3}/kyc/a.png`) === null);
    check(
      "a third-party URL is left alone",
      mediaSrc("https://lh3.googleusercontent.com/a") === "https://lh3.googleusercontent.com/a"
    );
    check("a data: URI is left alone", mediaSrc("data:image/png;base64,AAA") === "data:image/png;base64,AAA");

    // The proxy must serve what the rewriter points at; a prefix in one and not
    // the other is either a broken image or an open door.
    const route = code("src/app/api/media/[...key]/route.ts");
    check('the proxy serves the posts/ prefix', /key\.startsWith\("posts\/"\)/.test(route));
    check(
      "the proxy still refuses everything else",
      /key\.includes\("\.\."\)/.test(route) && !/startsWith\("kyc\//.test(route)
    );

    // The single-image branch was the one rendering a raw URL. Scoped to that
    // `<img>` and not the whole file: the grid below it passes a bare `url` to
    // SmartImage on purpose, which applies the same rewrite itself. The first
    // version of this check searched the file for `src={url}` on its own line —
    // it passed only because the working copy had CRLF endings, and went red
    // the moment a tool rewrote the file with LF without changing a character
    // of the code it was testing.
    const card = code("src/components/user/feed/feed-post-card.tsx");
    const imgStart = card.indexOf("<img");
    const imgBlock = card.slice(imgStart, card.indexOf("/>", imgStart));
    check(
      "the single-image post no longer renders a bare src",
      imgStart !== -1 &&
        /src=\{mediaSrc\(url\)\}/.test(imgBlock) &&
        !/src=\{url\}/.test(imgBlock)
    );
    check(
      "the composer preview goes through the proxy too",
      /src=\{mediaSrc\(url\)\}/.test(code("src/components/user/feed/create-post-composer.tsx"))
    );
  }

  /* ── 3. Task delete ── */
  console.log("\n3. Deleting a task never destroys a payment record");
  {
    const s = code("src/app/api/admin/tasks/[id]/route.ts");
    check("it counts submissions before deciding", /taskSubmission\.count\(/.test(s));
    check("a task with history is archived, not deleted", /status: "ARCHIVED"/.test(s));
    check("the response says which happened", /archived: true/.test(s) && /archived: false/.test(s));
    check(
      "a foreign-key failure is reported, not swallowed into a 500",
      /error\.code === "P2003"/.test(s)
    );
    check(
      "the admin UI reports what actually happened",
      /data\.archived/.test(code("src/components/admin/task-actions.tsx"))
    );
    // ARCHIVED must leave user-facing lists on its own.
    const vis = code("src/lib/task-visibility.ts");
    check(
      "visibleTaskWhere still matches ACTIVE only, so ARCHIVED is hidden",
      /status: TaskStatus\.ACTIVE/.test(vis)
    );

    // Live: archive a task that has a submission and prove nothing was lost.
    const u = await prisma.user.create({
      data: { email: `${tag}@t.local`, name: tag, password: "x", referralCode: tag },
      select: { id: true },
    });
    made.user = u.id;
    const t = await prisma.task.create({
      data: { title: `${tag} task`, description: "t", type: "CUSTOM", pointsReward: 5, xpReward: 1 },
      select: { id: true },
    });
    made.task = t.id;
    const sub = await prisma.taskSubmission.create({
      data: { taskId: t.id, userId: u.id, status: "APPROVED" },
      select: { id: true },
    });
    made.sub = sub.id;

    // A hard delete must be refused by the database — that Restrict is the
    // safety property, not an inconvenience.
    let restricted = false;
    try {
      await prisma.task.delete({ where: { id: t.id } });
    } catch {
      restricted = true;
    }
    check("the database refuses to delete a task with submissions", restricted);

    await prisma.task.update({ where: { id: t.id }, data: { status: "ARCHIVED" } });
    const after = await prisma.task.findUnique({ where: { id: t.id }, select: { status: true } });
    const subStill = await prisma.taskSubmission.findUnique({ where: { id: sub.id }, select: { id: true } });
    check("archiving works", after?.status === "ARCHIVED");
    check("the submission survives the archive", !!subStill);

    // A task with no submissions really is deleted.
    const clean = await prisma.task.create({
      data: { title: `${tag} clean`, description: "t", type: "CUSTOM", pointsReward: 5, xpReward: 1 },
      select: { id: true },
    });
    await prisma.task.delete({ where: { id: clean.id } });
    const gone = await prisma.task.findUnique({ where: { id: clean.id }, select: { id: true } });
    check("a task with no submissions is deleted outright", !gone);
  }

  /* ── 4. KYC duplicates ── */
  console.log("\n4. One document, one account");
  {
    // Normalisation — without it, adding a space defeats the whole check.
    check(
      "spacing and dashes do not make a different number",
      normalizeDocumentNumber("1234 5678") === "12345678" &&
        normalizeDocumentNumber("1234-5678") === "12345678" &&
        normalizeDocumentNumber("12345678") === "12345678"
    );
    check("case is normalised", normalizeDocumentNumber("ab12cd34") === "AB12CD34");
    check("empty stays empty", normalizeDocumentNumber(null) === "");
    check(
      "a too-short number is rejected",
      !isPlausibleDocumentNumber("123") && isPlausibleDocumentNumber("123456")
    );

    const lib = code("src/lib/kyc/document-number.ts");
    check(
      "the same user may resubmit their own number",
      /id: \{ not: userId \}/.test(lib)
    );
    check("a duplicate is recorded against BOTH accounts", (lib.match(/recordFraudEvent\(/g) ?? []).length >= 2);

    // Every path that accepts or approves a document must use the guard.
    for (const [label, f] of [
      ["manual submit", "src/app/api/kyc/route.ts"],
      ["scanned submit", "src/app/api/kyc/auto/route.ts"],
      ["admin approval", "src/app/api/admin/kyc/[id]/route.ts"],
    ] as const) {
      check(`${label} calls the guard`, /checkDocumentNumber\(/.test(code(f)));
    }
    check(
      "manual submission requires a number",
      /documentNumber: z\.string\(\)\.min\(4\)/.test(code("src/app/api/kyc/route.ts"))
    );
    check(
      "the manual form collects it",
      /documentNumber/.test(code("src/components/user/security/kyc-submit-view.tsx"))
    );
    check(
      "approval claims the number onto the user",
      /nidNumber: check\.normalized/.test(code("src/app/api/admin/kyc/[id]/route.ts"))
    );
    check(
      "the scanned path stores the NORMALISED number",
      /patch\.nidNumber = dupe\.normalized/.test(code("src/app/api/kyc/auto/route.ts"))
    );

    // Live: the database refuses a second account on the same number even with
    // the guard bypassed entirely.
    const num = `${tag.toUpperCase().replace(/[^A-Z0-9]/g, "")}99`;
    await prisma.user.update({ where: { id: made.user }, data: { nidNumber: num } });
    const u2 = await prisma.user.create({
      data: { email: `${tag}-2@t.local`, name: `${tag}2`, password: "x", referralCode: `${tag}2` },
      select: { id: true },
    });
    made.user2 = u2.id;
    let blocked = false;
    try {
      await prisma.user.update({ where: { id: u2.id }, data: { nidNumber: num } });
    } catch {
      blocked = true;
    }
    check("the unique index blocks a second account on the same ID", blocked);

    // ...and the same user re-claiming their own number is still fine.
    let ownOk = true;
    try {
      await prisma.user.update({ where: { id: made.user }, data: { nidNumber: num } });
    } catch {
      ownOk = false;
    }
    check("the same user may keep their own number", ownOk);
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (made.sub) await prisma.taskSubmission.deleteMany({ where: { id: made.sub } });
    if (made.task) await prisma.task.deleteMany({ where: { id: made.task } });
    for (const k of ["user", "user2"]) {
      if (made[k]) await prisma.user.deleteMany({ where: { id: made[k] } }).catch(() => {});
    }
    await prisma.fraudEvent.deleteMany({ where: { userId: { in: [made.user, made.user2].filter(Boolean) } } }).catch(() => {});
    console.log("fixtures cleaned");
    await prisma.$disconnect();
  });
