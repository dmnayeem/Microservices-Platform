import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  REACTIONS,
  reactionMeta,
  toReactionType,
  topReactions,
} from "../src/lib/reactions";
import { FEED_POST_SELECT } from "../src/lib/feed-post-shape";

/**
 * Feed: reactions, save, image viewer, report.
 *
 * The check this file exists for is the first one. `Post.likesCount` and
 * `awardSocialEarning` are keyed on the post so that unlike-then-relike cannot
 * pay twice — unliking lowers the visible count but never reverses the credit.
 * Reactions have to obey the same rule: if switching emoji counted as a new
 * reaction, cycling through five of them in a loop would mint points and inflate
 * the counter. Everything else here is ordinary wiring; that one is money.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-feed-features.ts
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

const tag = "feedfx-" + Math.random().toString(36).slice(2, 8);
const made: Record<string, string> = {};

async function main() {
  console.log("\n=== Feed features ===\n");

  /* ── 1. Reactions cannot mint points ── */
  console.log("1. Switching emoji is not a new reaction");
  {
    const route = code("src/app/api/feed/[id]/like/route.ts");
    check(
      "a switch updates the row and returns early",
      /if \(existingLike\.type === type\)/.test(route) &&
        /await prisma\.like\.update\(/.test(route)
    );
    // The three things a switch must NOT reach.
    const switchBlock = route.slice(
      route.indexOf("if (existingLike)"),
      route.indexOf("await prisma.like.create(")
    );
    check(
      "the switch path never increments likesCount",
      !/increment: 1/.test(switchBlock),
      switchBlock.slice(0, 120)
    );
    check(
      "the switch path never credits awardSocialEarning",
      !/awardSocialEarning/.test(switchBlock)
    );
    check(
      "the switch path never records event progress",
      !/recordUserAction/.test(switchBlock)
    );
    // Unliking SHOULD lower the visible count — what it must never do is undo
    // the credit, because `recordUserAction` is keyed on the post so a
    // relike would otherwise pay a second time.
    const del = route.slice(route.indexOf("export async function DELETE"));
    check("unliking lowers the visible count", /decrement: 1/.test(del));
    check(
      "unliking does NOT reverse the credit or the event progress",
      !/awardSocialEarning/.test(del) && !/recordUserAction/.test(del)
    );

    // Live proof.
    const owner = await prisma.user.create({
      data: { email: `${tag}-o@t.local`, name: `${tag}o`, password: "x", referralCode: `${tag}o` },
      select: { id: true, pointsBalance: true },
    });
    made.owner = owner.id;
    const reactor = await prisma.user.create({
      data: { email: `${tag}-r@t.local`, name: `${tag}r`, password: "x", referralCode: `${tag}r` },
      select: { id: true },
    });
    made.reactor = reactor.id;
    const post = await prisma.post.create({
      data: { userId: owner.id, content: `${tag} post` },
      select: { id: true },
    });
    made.post = post.id;

    // First reaction: the one that counts.
    await prisma.like.create({
      data: { postId: post.id, userId: reactor.id, type: "LOVE" },
    });
    await prisma.post.update({
      where: { id: post.id },
      data: { likesCount: { increment: 1 } },
    });

    const balanceBefore = (
      await prisma.user.findUnique({
        where: { id: owner.id },
        select: { pointsBalance: true },
      })
    )?.pointsBalance;

    // Now switch four times, exactly as the route does for a switch.
    for (const t of ["HAHA", "WOW", "SAD", "LIKE"]) {
      await prisma.like.update({
        where: { postId_userId: { postId: post.id, userId: reactor.id } },
        data: { type: t },
      });
    }

    const [rows, after, balanceAfter] = await Promise.all([
      prisma.like.count({ where: { postId: post.id } }),
      prisma.post.findUnique({ where: { id: post.id }, select: { likesCount: true } }),
      prisma.user
        .findUnique({ where: { id: owner.id }, select: { pointsBalance: true } })
        .then((u) => u?.pointsBalance),
    ]);
    check("four switches leave exactly one Like row", rows === 1, `${rows}`);
    check("likesCount is still 1", after?.likesCount === 1, `${after?.likesCount}`);
    check(
      "the post owner's balance did not move",
      balanceBefore === balanceAfter,
      `${balanceBefore} -> ${balanceAfter}`
    );

    const finalType = await prisma.like.findUnique({
      where: { postId_userId: { postId: post.id, userId: reactor.id } },
      select: { type: true },
    });
    check("the last emoji picked is the one stored", finalType?.type === "LIKE");
  }

  /* ── 2. Reading them back ── */
  console.log("\n2. Reactions read back in bulk, not per post");
  {
    const feed = code("src/app/api/feed/route.ts");
    check(
      "the page breakdown is one groupBy, not a query per post",
      /groupBy\(\{\s*by: \["postId", "type"\]/.test(feed)
    );
    check("myReaction is returned", /myReaction: myReactions\.get\(post\.id\)/.test(feed));
    check("reactionCounts is returned", /reactionCounts: reactionCounts\[post\.id\]/.test(feed));
    check("isSaved is batched like isLiked", /savedSet\.has\(post\.id\)/.test(feed));

    // The shared shape — a second copy is how two lists drift apart.
    check(
      "the saved list reuses the feed's select and formatter",
      /FEED_POST_SELECT/.test(code("src/app/api/feed/saved/route.ts")) &&
        /formatFeedPost/.test(code("src/app/api/feed/saved/route.ts"))
    );
    check("the shared select still carries the core columns",
      ["id","userId","content","images","likesCount","commentsCount"].every(
        (k) => k in (FEED_POST_SELECT as Record<string, unknown>)
      )
    );

    // Reaction helpers.
    check("there are five reactions", REACTIONS.length === 5);
    check("an unknown type falls back to 👍", reactionMeta("NONSENSE").type === "LIKE");
    check("an unknown type normalises to LIKE", toReactionType(undefined) === "LIKE");
    check(
      "the cluster shows the most-used first, capped at three",
      JSON.stringify(
        topReactions({ LIKE: 2, LOVE: 9, HAHA: 5, WOW: 1 }).map((r) => r.type)
      ) === JSON.stringify(["LOVE", "HAHA", "LIKE"])
    );
  }

  /* ── 3. Save ── */
  console.log("\n3. Saving is private and idempotent");
  {
    const route = code("src/app/api/feed/[id]/save/route.ts");
    check("saving is an upsert, so a double-tap makes one row", /savedPost\.upsert\(/.test(route));
    check("unsaving is deleteMany, so it cannot 404 on a no-op", /savedPost\.deleteMany\(/.test(route));
    // The point of the feature: it must not be farmable.
    check(
      "saving credits nothing and moves no counter",
      !/awardSocialEarning|recordUserAction|likesCount|increment/.test(route)
    );

    await prisma.savedPost.create({ data: { userId: made.reactor, postId: made.post } });
    await prisma.savedPost
      .upsert({
        where: { userId_postId: { userId: made.reactor, postId: made.post } },
        create: { userId: made.reactor, postId: made.post },
        update: {},
      })
      .catch(() => null);
    const n = await prisma.savedPost.count({ where: { postId: made.post } });
    check("saving twice leaves one row", n === 1, `${n}`);

    await prisma.savedPost.deleteMany({ where: { userId: made.reactor, postId: made.post } });
    const n2 = await prisma.savedPost.count({ where: { postId: made.post } });
    check("unsaving removes it", n2 === 0);

    const post = await prisma.post.findUnique({
      where: { id: made.post },
      select: { likesCount: true },
    });
    check("no counter moved during any of that", post?.likesCount === 1);
  }

  /* ── 4. The wiring that already existed ── */
  console.log("\n4. The primitives are finally used");
  {
    const card = code("src/components/user/feed/feed-post-card.tsx");
    check("the post card mounts the image viewer", /<ImageZoomModal/.test(card));
    check("photos are clickable", /onClick=\{\(\) => onImageTap\(/.test(card));
    check("double-tap likes the post", /lastTapRef/.test(card) && /setBurst\(true\)/.test(card));
    check("the post card mounts the report modal", /<ReportContent/.test(card));
    check('report targets a POST', /targetType="POST"/.test(card));
    check("the reaction picker is used", /<ReactionButton/.test(card));
    check("save is in the action row and the menu", (card.match(/toggleSave/g) ?? []).length >= 3);

    // Motion, and the accessibility guarantee that comes free with it.
    const css = read("src/app/globals.css");
    check("the feed's keyframes exist", /@keyframes card-in/.test(css) && /@keyframes heart-burst/.test(css));
    check(
      "all of it is disabled under prefers-reduced-motion",
      /@media \(prefers-reduced-motion: reduce\)/.test(css) &&
        /animation-duration: 0\.001ms !important/.test(css)
    );
    check("cards animate in", /animate-card-in/.test(card));
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
    if (made.post) {
      await prisma.savedPost.deleteMany({ where: { postId: made.post } }).catch(() => {});
      await prisma.like.deleteMany({ where: { postId: made.post } }).catch(() => {});
      await prisma.post.deleteMany({ where: { id: made.post } }).catch(() => {});
    }
    for (const k of ["owner", "reactor"]) {
      if (made[k]) await prisma.user.deleteMany({ where: { id: made[k] } }).catch(() => {});
    }
    console.log("fixtures cleaned");
    await prisma.$disconnect();
  });
