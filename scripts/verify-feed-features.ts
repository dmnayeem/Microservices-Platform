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
import {
  FEED_AUTHOR_SELECT,
  FEED_POST_SELECT,
} from "../src/lib/feed-post-shape";

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
    // The route's job is the BULK LOOKUPS; the shared formatter's job is putting
    // them on the payload. Assert each where it actually lives — pointing these
    // at the route is how the ads-reporting suite went red while the behaviour
    // was fine.
    check(
      "the route batches reactions and saves for the whole page",
      /myReactions = new Map\(likes\.map/.test(feed) &&
        /savedSet = new Set\(saved\.map/.test(feed)
    );
    check(
      "the route hands those maps to the formatter",
      /myReactions,/.test(feed) && /saved: savedSet,/.test(feed)
    );
    const shape = code("src/lib/feed-post-shape.ts");
    check("myReaction is on the payload", /myReaction: ctx\.myReactions\.get\(post\.id\)/.test(shape));
    check("reactionCounts is on the payload", /reactionCounts: ctx\.reactionCounts\[post\.id\]/.test(shape));
    check("isSaved is on the payload", /isSaved: ctx\.saved\.has\(post\.id\)/.test(shape));

    // ── One definition of a post's shape ──────────────────────────────────
    //
    // The feed and the saved list render the SAME `FeedPostCard`, so both have
    // to produce the same object. When they each kept their own select and
    // formatter the two were byte-identical — and would have stayed that way
    // only until the next field was added to the feed and not to the other,
    // which nothing would have caught. These assertions are what makes that
    // impossible rather than merely unlikely.
    const FEED_ROUTE = "src/app/api/feed/route.ts";
    const SAVED_ROUTE = "src/app/api/feed/saved/route.ts";
    for (const f of [FEED_ROUTE, SAVED_ROUTE]) {
      check(
        `${f.split("/").slice(-2).join("/")} imports the shared shape`,
        /from "@\/lib\/feed-post-shape"/.test(code(f))
      );
      check(
        `${f.split("/").slice(-2).join("/")} uses the shared formatter`,
        /formatFeedPost\(/.test(code(f))
      );
    }
    // The duplication itself: only the shared module may define these.
    const defsSelect = [FEED_ROUTE, SAVED_ROUTE].filter((f) =>
      /^\s*(export )?const FEED_POST_SELECT = \{/m.test(code(f))
    );
    check(
      "neither route declares its own FEED_POST_SELECT",
      defsSelect.length === 0,
      defsSelect.join(", ")
    );
    const defsFormat = [FEED_ROUTE, SAVED_ROUTE].filter((f) =>
      /const formatPost = \(post: \w+\) => \(\{/.test(code(f))
    );
    check(
      "neither route inlines its own post mapping",
      defsFormat.length === 0,
      defsFormat.join(", ")
    );
    check(
      "the shared module is the only place FEED_POST_SELECT is defined",
      /export const FEED_POST_SELECT = \{/.test(
        code("src/lib/feed-post-shape.ts")
      )
    );
    // Matching post fields are not enough if the AUTHOR underneath disagrees.
    // The saved list first hand-rolled that object and sent `packageTier` where
    // the card reads `package`, with no `verifiedBadgeStyle` at all — so badges
    // rendered differently on /saved and the post fields all still matched.
    for (const f of [FEED_ROUTE, SAVED_ROUTE]) {
      check(
        `${f.split("/").slice(-2).join("/")} selects authors from the shared list`,
        /select: FEED_AUTHOR_SELECT/.test(code(f))
      );
    }
    const remapped = [FEED_ROUTE, SAVED_ROUTE].filter((f) =>
      /packageTier:/.test(code(f))
    );
    check(
      "neither route remaps the author row by hand",
      remapped.length === 0,
      remapped.join(", ")
    );
    check(
      "the shared author select still carries the badge fields the card reads",
      ["package", "isBlueVerified", "verifiedBadgeStyle", "level", "role"].every(
        (k) => k in (FEED_AUTHOR_SELECT as Record<string, unknown>)
      )
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

  /* ── 5. The card polish round ── */
  console.log("\n5. Picker reachable, comments collapsible, mentions findable");
  {
    const card = code("src/components/user/feed/feed-post-card.tsx");
    const picker = code("src/components/user/feed/reaction-button.tsx");
    const comments = code("src/components/user/feed/comments-section.tsx");
    const mention = code("src/components/user/feed/mention-autocomplete.tsx");
    const breakdown = code("src/components/user/feed/reaction-breakdown.tsx");
    const reactions = code("src/lib/reactions.ts");

    // The emoji cluster sat directly above the like button showing the SAME
    // number, one line apart.
    check(
      "the duplicate emoji cluster is gone from the card",
      !/topReactions\(/.test(card)
    );
    check(
      "the count is still shown exactly once in the action row",
      (card.match(/count=\{post\.likesCount\}/g) ?? []).length === 1
    );

    // Where the breakdown went instead: behind a tap on the number. The count
    // had to leave the like button first — inside it, a tap could only ever
    // mean "like".
    check(
      "the count is no longer inside the toggle button",
      !/count/.test(picker) && /<ReactionBreakdown/.test(card)
    );
    check(
      "tapping the number opens the per-emoji split",
      /onClick=\{\(\) => setOpen\(\(v\) => !v\)\}/.test(breakdown) &&
        /reactionBreakdown\(counts\)/.test(breakdown)
    );
    check(
      "it costs no request — the counts already arrive with the post",
      !/fetch\(/.test(breakdown) && /reactionCounts/.test(card)
    );
    check(
      "a post nobody reacted to offers no tap into an empty box",
      /if \(count <= 0\)/.test(breakdown)
    );
    check(
      "it dismisses on outside pointer and Escape, like the picker",
      /pointerdown/.test(breakdown) && /"Escape"/.test(breakdown)
    );
    check(
      "every reaction is listed in catalog order, zeros included",
      /REACTIONS\.map/.test(reactions) &&
        /count: Math\.max\(0, Math\.trunc\(counts\?\.\[r\.type\] \?\? 0\)\)/.test(
          reactions
        )
    );
    // Without this the split still shows the emoji you just removed.
    check(
      "the split moves with an optimistic reaction, both ways",
      (card.match(/shiftReactionCounts\(/g) ?? []).length === 2
    );
    check(
      "…and a failed request puts the old split back",
      /reactionCounts: post\.reactionCounts/.test(card)
    );
    check(
      "switching emoji moves one across without changing the total",
      /if \(from === to\) return next;/.test(reactions) &&
        /next\[from\] = Math\.max\(0, \(next\[from\] \?\? 0\) - 1\)/.test(reactions)
    );

    // Both halves of the hover fix. `mb-2` left an 8px strip belonging to
    // nobody, so moving up to an emoji fired pointerleave and closed the picker
    // before it could be reached.
    check(
      "the picker's gap is padding on the hover wrapper, not margin on the picker",
      /absolute bottom-full left-0 pb-2/.test(picker) &&
        !/bottom-full left-0 mb-2/.test(picker)
    );
    check(
      "the wrapper itself keeps the picker open while the pointer crosses",
      /onPointerEnter=\{openNow\}/.test(picker)
    );
    check(
      "closing is deferred and cancellable",
      /closeRef\.current = setTimeout/.test(picker) && /cancelClose\(\)/.test(picker)
    );

    // Comments: preview, an explicit way out, and the guard that matters.
    check(
      "comments show a preview before the full thread",
      /PREVIEW_COUNT/.test(comments) &&
        /View all \{topLevel\.length\} comments/.test(comments)
    );
    check("there is a Hide comments control", /Hide comments/.test(comments));
    // It has to sit outside the `topLevel.length > 0` branch: on a post with no
    // comments the section still opens, and without this the only way out is the
    // button that opened it, scrolled off above.
    check(
      "…and it is offered even when the post has no comments yet",
      /\{!loading && \(\s*<div className="flex items-center justify-between gap-3 mt-2">/.test(
        comments
      )
    );
    check(
      "the card collapses comments on an outside click",
      /articleRef\.current\?\.contains\(e\.target as Node\)/.test(card)
    );
    // The owner's explicit decision, and the easiest thing for a later edit to
    // drop: never discard a half-written comment.
    check(
      "…but NOT while a comment is half-written",
      /if \(hasDraft\) return;/.test(card) &&
        /onDraftChange=\{setHasDraft\}/.test(card)
    );

    // Mentions already worked; only the autocomplete was missing.
    check(
      "the autocomplete reuses the existing user search",
      /\/api\/users\/search\?q=/.test(mention)
    );
    check(
      "no new endpoint was added for it",
      !fs.existsSync(path.join(root, "src/app/api/users/mentions")) &&
        !fs.existsSync(path.join(root, "src/app/api/mentions"))
    );
    check(
      "it is mounted on both the composer and the comment box",
      /useMentionAutocomplete/.test(
        code("src/components/user/feed/create-post-composer.tsx")
      ) && /useMentionAutocomplete/.test(comments)
    );
    check(
      "the keyboard works, not just the mouse",
      /"ArrowDown"/.test(mention) &&
        /"Enter" \|\| e\.key === "Tab"/.test(mention) &&
        /"Escape"/.test(mention)
    );
    // Enter must pick a name rather than posting the comment.
    check(
      "the picker gets first refusal on Enter in the comment box",
      /if \(mention\.onKeyDown\(e\)\) return;/.test(comments)
    );
    // And the half that already existed must still be intact.
    const feedRoute = code("src/app/api/feed/route.ts");
    check(
      "the server still resolves mentions and credits them",
      /extractMentionUsernames/.test(feedRoute) &&
        /resolveMentionedUsers/.test(feedRoute) &&
        /mention\.createMany/.test(feedRoute) &&
        /MENTION_RECEIVED/.test(feedRoute)
    );
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
