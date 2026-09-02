import "dotenv/config";
import fs from "fs";
import path from "path";

/**
 * The profile page: where the two big cards sit, and how much a stranger sees.
 *
 * Two separate complaints, one page. The layout half is arithmetic — a 1/3
 * column holding four cards next to a 2/3 column holding three leaves a tall
 * empty band down the right of the page, which is exactly what the owner
 * photographed. The public half is a privacy question: a public profile should
 * show what someone chose to publish and nothing they did not, and the sharp
 * edge is that "show more" is one careless field away from leaking a phone
 * number.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-profile-layout-and-public.ts
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}

console.log("\n=== Profile layout & public profile ===\n");

/* ── 1. The two cards moved out of the narrow column ── */
console.log("1. Courses & Marketplace beside Verification & Security");
const body = code("src/components/user/profile/profile-tab-body.tsx");
const gridStart = body.indexOf('lg:grid-cols-3');
const gridEnd = body.indexOf('lg:grid-cols-2 gap-5');
check("there is a full-width two-column row", gridEnd > 0);
const insideThreeCol = body.slice(gridStart, gridEnd);
check(
  "Verification & Security is no longer in the 1/3 column",
  !insideThreeCol.includes('title="Verification & Security"')
);
check(
  "…nor is Courses & Marketplace",
  !insideThreeCol.includes('title="Courses & Marketplace"')
);
const row = body.slice(gridEnd);
const cIdx = row.indexOf('title="Courses & Marketplace"');
const vIdx = row.indexOf('title="Verification & Security"');
check("both are in the new row", cIdx > 0 && vIdx > 0);
check(
  "Courses & Marketplace comes first, so it renders on the LEFT",
  cIdx < vIdx,
  "this is the order the owner asked for, and grid order is source order"
);
// They are wide again, so their inner grids go back to two-up.
check(
  "the verification tiles use the full width again",
  row.includes('grid grid-cols-1 sm:grid-cols-2 gap-2')
);
check(
  "…and so does courses / marketplace",
  row.includes('grid grid-cols-1 md:grid-cols-2 gap-3')
);
check(
  "the completion list still has no inner scrollbar",
  !body.includes("max-h-44 overflow-y-auto")
);

/* ── 2. The public profile shows something ── */
console.log("\n2. A public profile is worth opening");
const api = code("src/app/api/users/[id]/profile/route.ts");
const view = code("src/components/user/profile/public-profile-view.tsx");
// "All the user's details except number and email" — each one named, so
// dropping one is a failing test rather than a quiet regression.
for (const field of [
  "profession",
  "nationality",
  "language",
  "gender",
  "dateOfBirth",
  "bloodGroup",
  "maritalStatus",
  "studyLevel",
  "timezone",
]) {
  // Each of these used to be published unconditionally. They are still
  // published — now through the per-field privacy gate, so somebody can
  // restrict one without losing the rest. See verify-profile-privacy.
  check(
    `the API publishes ${field}`,
    new RegExp(`${field}: show\\("${field}"\\) \\? u\\.${field} : null`).test(api)
  );
}
check(
  "city and district ride behind the location switch",
  /city: showByPrivacy\(u\.privacyLocation\) \? u\.city : null/.test(api) &&
    /district: showByPrivacy\(u\.privacyLocation\) \? u\.district : null/.test(api),
  "one setting for 'where I am', not three"
);
check(
  "connected accounts are published",
  /socialAccounts: show\("socialAccounts"\) \? u\.socialAccounts : \[\]/.test(api),
  "on their own switch — hiding a bio should not also hide linked accounts"
);
check(
  "what the person has published is counted",
  /coursesCreated/.test(api) && /marketplaceListings/.test(api)
);
check(
  "only PUBLISHED courses count",
  /status: "PUBLISHED"/.test(api),
  "a draft is not something a stranger can look at"
);
check("the view renders an About card", /">About<\/h2>/.test(view));
check(
  "the facts are built as a list, so the grid has no holes",
  /const aboutFacts:/.test(view) && /aboutFacts\.map\(/.test(view),
  "a wall of conditional JSX leaves gaps where the empty facts would have been"
);
check(
  "location is one line, de-duplicated",
  /\.filter\(\(v, i, arr\) => arr\.indexOf\(v\) === i\)/.test(view),
  '"Dhaka, Dhaka, BD" reads worse than the parts joined once'
);
check(
  "…and hides it entirely when there is nothing to say",
  /aboutFacts\.length > 0 \|\|[\s\S]{0,200}marketplaceListings > 0 \? \(/.test(view),
  "a card of empty dashes is worse than no card"
);
check(
  "a connected account only becomes a link when a URL was stored",
  /a\.url \? \(/.test(view),
  "guessing a profile URL per platform is how you send people to the wrong account"
);
check(
  "outbound links are nofollow and noopener",
  /rel="noopener noreferrer nofollow"/.test(view)
);

/* ── 2b. Posts as a grid ── */
console.log("\n2b. Posts read as a body of work");
check(
  "posts render as square tiles, not a column of banners",
  /aspect-square/.test(view) && /grid-cols-2 sm:grid-cols-3/.test(view)
);
check(
  "every tile carries its own numbers",
  /p\.likesCount/.test(view) &&
    /p\.commentsCount/.test(view) &&
    /p\.viewsCount/.test(view)
);
check(
  "the counts stay readable on top of a photo",
  /from-black\/85/.test(view),
  "plain text over an arbitrary image is unreadable at the bottom edge"
);
check(
  "a text-only post keeps its colour instead of being a blank square",
  /getPostBackground\(p\.backgroundStyle\)/.test(view) &&
    /backgroundStyle: true/.test(code("src/app/api/users/[id]/posts/route.ts")),
  "the API has to send it, or the tile has nothing to paint"
);
check("a multi-image post says so", /\+\{p\.images\.length - 1\}/.test(view));
check(
  "a tile opens the post rather than going nowhere",
  /setOpen\(p\)/.test(view) && /content=\{open\.content\}/.test(view),
  "there is no permalink page for a post, so the profile itself has to show it"
);
check(
  "the loading state is the grid's own shape",
  /aspect-square rounded-xl border border-gray-800 bg-gray-900\/40 animate-pulse/.test(
    view
  ),
  "a differently-shaped skeleton makes the page jump when the posts land"
);

/* ── 3. …and nothing more than that ── */
console.log("\n3. Nothing private leaked");
// The select is the boundary. A field that is never selected cannot be
// returned by a later careless spread, which is the failure mode worth
// guarding: the payload is hand-built today, but the select outlives it.
//
// The line is drawn between describing a person and reaching one. The owner
// asked for "all the user's details except number and email", so gender,
// birthday, blood group, marital status, education, timezone and a coarse
// city/district are published — they say who somebody is. What stays out is
// the means to contact, impersonate or turn up at them: both email addresses,
// both phone numbers, the national ID, and the exact street and postal code.
const selectBlock = api.slice(
  api.indexOf("const u = (await prisma.user.findUnique"),
  api.indexOf("if (!u) {")
);
for (const field of [
  "email",
  "phone",
  "nidNumber",
  "street",
  "postalCode",
  "secondaryEmail",
  "secondaryPhone",
  "password",
  "twoFactorSecret",
]) {
  check(
    `${field} is not even selected`,
    !new RegExp(`\\b${field}: true`).test(selectBlock)
  );
}
check(
  "the privacy gate still applies to bio, avatar, location and stats",
  /showByPrivacy\(u\.privacyBio\)/.test(api) &&
    /showByPrivacy\(u\.privacyAvatar\)/.test(api) &&
    /showByPrivacy\(u\.privacyLocation\)/.test(api) &&
    /showByPrivacy\(u\.privacyStats\)/.test(api)
);
check(
  "earnings keep their own, stricter switch",
  /const earningsVisible = showByPrivacy\(u\.privacyEarnings\)/.test(api),
  "privacyEarnings defaults to PRIVATE while the others do not"
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
