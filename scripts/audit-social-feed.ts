import { prisma } from "./_q";

/**
 * The social side: posts, comments, reactions, groups, and the earning they pay.
 *
 * Read-only. The feed is the other half of the platform — it is where users
 * spend their time and where `awardSocialEarning` pays out — so it gets the same
 * treatment as tasks: counters that must match their rows, earning that must
 * trace to a ledger entry, and nothing pointing at something that no longer
 * exists.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/audit-social-feed.ts
 */

let problems = 0;
function ok(s: string, d?: string) {
  console.log(`  ok    ${s}${d ? ` — ${d}` : ""}`);
}
function bad(s: string, d: string) {
  problems++;
  console.log(`  ISSUE ${s}\n        ${d}`);
}
function note(s: string) {
  console.log(`  note  ${s}`);
}

async function main() {
  console.log("\n=== Social feed (live data) ===\n");

  const [posts, comments, likes, follows, groups] = await Promise.all([
    prisma.post.count(),
    prisma.comment.count(),
    prisma.like.count(),
    prisma.follow.count(),
    prisma.group.count(),
  ]);
  console.log(
    `  ${posts} posts · ${comments} comments · ${likes} reactions · ${follows} follows · ${groups} groups\n`
  );

  /* 1. Denormalised counters match their rows. */
  //
  // Every one of these is read on the card and sorted on. A counter that has
  // drifted from its rows is not cosmetic: `likesCount` decides ordering and
  // `commentsCount` decides whether the "View all N comments" link appears at
  // all — a post can end up advertising comments it does not have.
  console.log("1. Counters match the rows they count");
  const likeDrift = (await prisma.$queryRawUnsafe(
    `SELECT p.id, p."likesCount" AS stored, COUNT(l.id)::int AS actual
       FROM "Post" p LEFT JOIN "Like" l ON l."postId" = p.id
      GROUP BY p.id, p."likesCount"
     HAVING p."likesCount" <> COUNT(l.id)::int
      LIMIT 20`
  )) as Array<{ id: string; stored: number; actual: number }>;
  if (likeDrift.length === 0) ok("every post's likesCount equals its Like rows");
  else
    bad(
      `${likeDrift.length} post(s) have a likesCount that disagrees with their reactions`,
      likeDrift
        .slice(0, 8)
        .map((r) => `${r.id} stored=${r.stored} actual=${r.actual}`)
        .join("\n        ")
    );

  const commentDrift = (await prisma.$queryRawUnsafe(
    `SELECT p.id, p."commentsCount" AS stored, COUNT(c.id)::int AS actual
       FROM "Post" p LEFT JOIN "Comment" c ON c."postId" = p.id
      GROUP BY p.id, p."commentsCount"
     HAVING p."commentsCount" <> COUNT(c.id)::int
      LIMIT 20`
  )) as Array<{ id: string; stored: number; actual: number }>;
  if (commentDrift.length === 0)
    ok("every post's commentsCount equals its Comment rows");
  else
    bad(
      `${commentDrift.length} post(s) have a commentsCount that disagrees with their comments`,
      commentDrift
        .slice(0, 8)
        .map((r) => `${r.id} stored=${r.stored} actual=${r.actual}`)
        .join("\n        ")
    );

  const followDrift = (await prisma.$queryRawUnsafe(
    `SELECT u.id, u.email, u."followersCount" AS stored, COUNT(f.id)::int AS actual
       FROM "User" u LEFT JOIN "Follow" f ON f."followingId" = u.id
      GROUP BY u.id, u.email, u."followersCount"
     HAVING u."followersCount" <> COUNT(f.id)::int
      LIMIT 20`
  )) as Array<{ email: string; stored: number; actual: number }>;
  if (followDrift.length === 0) ok("every account's followersCount equals its Follow rows");
  else
    note(
      `${followDrift.length} account(s) have a followersCount that differs from their Follow rows — check whether displayFollowersBoost explains it (it is an admin-set vanity offset)`
    );

  /* 2. Reactions are one row per person per post. */
  console.log("\n2. One reaction per person per post");
  const dupLikes = (await prisma.$queryRawUnsafe(
    `SELECT "postId", "userId", COUNT(*)::int AS c
       FROM "Like" GROUP BY 1,2 HAVING COUNT(*) > 1 LIMIT 10`
  )) as Array<{ postId: string; userId: string; c: number }>;
  if (dupLikes.length === 0)
    ok("nobody has two reactions on the same post (switching emoji updates the row)");
  else
    bad(
      "a user has more than one reaction row on the same post",
      dupLikes.map((d) => `${d.postId}/${d.userId} x${d.c}`).join(", ")
    );

  const badTypes = (await prisma.$queryRawUnsafe(
    `SELECT type, COUNT(*)::int AS c FROM "Like"
      WHERE type NOT IN ('LIKE','LOVE','HAHA','WOW','SAD')
      GROUP BY 1`
  )) as Array<{ type: string; c: number }>;
  if (badTypes.length === 0) ok("every reaction is one of the five known types");
  else
    bad(
      "reactions exist with a type the app does not know",
      badTypes.map((t) => `${t.type} x${t.c}`).join(", ") +
        " — these are dropped from the breakdown, so the rows will not add up to the count"
    );

  /* 3. Social earning traces to the ledger. */
  console.log("\n3. Social earning is on the ledger");
  const socialTx = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c, COALESCE(SUM(points),0)::int AS pts
       FROM "Transaction" WHERE reference LIKE 'social\\_%' AND status = 'COMPLETED'`
  )) as Array<{ c: number; pts: number }>;
  console.log(`  ${socialTx[0].c} social earning rows worth ${socialTx[0].pts} points`);
  const dupSocial = (await prisma.$queryRawUnsafe(
    `SELECT "userId", reference, COUNT(*)::int AS c
       FROM "Transaction" WHERE reference LIKE 'social\\_%'
      GROUP BY 1,2 HAVING COUNT(*) > 1 LIMIT 10`
  )) as Array<{ reference: string; c: number }>;
  if (dupSocial.length === 0) ok("no social earning was paid twice for the same event");
  else
    bad(
      "a social earning event was paid more than once",
      dupSocial.map((d) => `${d.reference} x${d.c}`).join(", ")
    );

  /* 4. Nothing points at something that is gone. */
  console.log("\n4. No dangling rows");
  const dangling = (await prisma.$queryRawUnsafe(
    `SELECT
       (SELECT COUNT(*)::int FROM "Comment" c WHERE NOT EXISTS (SELECT 1 FROM "Post" p WHERE p.id = c."postId")) AS orphan_comments,
       (SELECT COUNT(*)::int FROM "Like" l WHERE NOT EXISTS (SELECT 1 FROM "Post" p WHERE p.id = l."postId")) AS orphan_likes,
       (SELECT COUNT(*)::int FROM "Post" p WHERE p."groupId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Group" g WHERE g.id = p."groupId")) AS posts_in_missing_group,
       (SELECT COUNT(*)::int FROM "Comment" c WHERE c."parentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Comment" p WHERE p.id = c."parentId")) AS replies_to_missing_comment`
  )) as Array<Record<string, number>>;
  const d = dangling[0];
  const total = Object.values(d).reduce((a, b) => a + b, 0);
  if (total === 0) ok("every comment, reaction and reply points at something that exists");
  else bad("rows point at deleted parents", JSON.stringify(d));

  /* 5. Media the browser can actually load. */
  console.log("\n5. Post images go through the media proxy");
  const raw = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS c FROM "Post"
      WHERE array_length(images, 1) > 0
        AND EXISTS (
          SELECT 1 FROM unnest(images) AS img
           WHERE img LIKE 'http%' AND img NOT LIKE '/api/media/%'
        )`
  )) as Array<{ c: number }>;
  if (raw[0].c === 0) ok("no post stores an absolute URL that would bypass the proxy");
  else
    note(
      `${raw[0].c} post(s) store an absolute image URL — fine if the host is public, broken if it is the private bucket (the proxy exists because that bucket 403s)`
    );

  console.log(
    `\n${problems === 0 ? "No social-feed issues found." : `${problems} issue area(s) found.`}\n`
  );
  process.exit(0);
}
main();
