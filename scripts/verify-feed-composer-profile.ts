import "dotenv/config";
import fs from "fs";
import path from "path";
import { findFirstUrl, findUrls } from "../src/lib/post-urls";
import { placementSpec } from "../src/lib/ad-placements";

/**
 * The rail ad, the mission list, the composer and the profile column.
 *
 * The URL half is the part worth real tests. Both the composer and the post card
 * used to carry their own `/https?:\/\//` matcher, so a post saying
 * "example.com" got no preview AND no link — silently, with nothing to tell the
 * author why. Widening that is easy to get wrong in the other direction, which
 * is why the false-positive cases below outnumber the true ones.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-feed-composer-profile.ts
 */

const root = process.cwd();
const code = (p: string) =>
  fs
    .readFileSync(path.join(root, p), "utf8")
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

console.log("\n=== Rail ad · mission list · composer · profile ===\n");

/* ── 1. The rail ad fills its column ── */
console.log("1. The sidebar ad matches the widgets under it");
check(
  "FEED_SIDEBAR is marked as filling its column",
  placementSpec("FEED_SIDEBAR").fillsColumn === true,
  "without this it caps at the 300px preset and looks shrunken in a 416px rail"
);
check(
  "a wide space still caps its width",
  !placementSpec("ANCHOR_BOTTOM").fillsColumn &&
    !placementSpec("DASHBOARD").fillsColumn,
  "the cap exists so a small creative is not marooned in a wide band — only the narrow rail opts out"
);
const renderer = code("src/components/user/primitives/ad-renderer.tsx");
check(
  "the renderer honours the flag",
  /slotDim && !spec\.fillsColumn \? \{ maxWidth: slotDim\.w \}/.test(renderer)
);
check(
  "…and so does the loading skeleton",
  /placeSpec\.fillsColumn \? undefined : reserved\?\.w/.test(renderer),
  "a 300px skeleton followed by a 416px ad is the layout jump the skeleton exists to prevent"
);

/* ── 2. The mission list ── */
console.log("\n2. The daily-mission rows line up");
const rail = code("src/components/user/feed/feed-right-rail.tsx");
check(
  "the progress column is fixed width and right-aligned",
  /w-9 text-right text-gray-500 tabular-nums/.test(rail)
);
check(
  "the points column is too",
  /w-12 inline-flex items-center justify-end/.test(rail),
  "flexible columns put nine rows of numbers at nine different x positions"
);
check("the label takes the slack", /flex-1 min-w-0 truncate/.test(rail));

/* ── 3. The composer ── */
console.log("\n3. The composer");
const composer = code("src/components/user/feed/create-post-composer.tsx");
check(
  "the More/Fewer options toggle is gone",
  !/More options|Fewer options|setShowMore/.test(composer)
);
check("the markdown hint is gone", !/\*\*bold\*\* · \*italic\*/.test(composer));
check(
  "the photo, background and image-URL controls are no longer hidden behind it",
  /title="Add photo"/.test(composer) && !/showMore/.test(composer)
);
check(
  "a selection reveals bold / italic / underline",
  /hasSelection && \(/.test(composer) &&
    /wrapSelection\("\*\*"\)/.test(composer) &&
    /wrapSelection\("\*"\)/.test(composer) &&
    /wrapSelection\("__"\)/.test(composer)
);
check(
  "the bar tracks every way of selecting",
  /onSelect=\{/.test(composer),
  "`onSelect` covers drags, double-clicks, shift-arrows and touch handles alike"
);
check(
  "the format buttons do not steal focus",
  /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/.test(
    code("src/components/user/feed/composer-bits.tsx")
  ),
  "taking focus collapses the selection, and the wrap would then wrap nothing"
);
check(
  "closing the bar is delayed so a click can land first",
  /setTimeout\(\(\) => setHasSelection\(false\), 180\)/.test(composer)
);
const content = code("src/components/user/feed/feed-content.tsx");
check(
  "underline actually renders — the button is not writing dead markup",
  /__\(\[\^_\]\+\)__/.test(content) && /<u key=/.test(content)
);
check(
  "underline is __x__, not _x_",
  !/\|_\(\[\^_\]\+\)_\//.test(content),
  "single underscores are ordinary characters in snake_case and file names"
);

/* ── 4. Links: one rule, both ends ── */
console.log("\n4. Link detection is shared and correct");
check(
  "the composer uses the shared detector",
  /findFirstUrl\(content\)/.test(composer)
);
check(
  "the post card uses it too",
  /findFirstUrl\(post\.content\)/.test(code("src/components/user/feed/feed-post-card.tsx"))
);
check(
  "neither keeps a private copy any more",
  !/function firstUrlInText/.test(composer) &&
    !/function firstUrlInText/.test(
      code("src/components/user/feed/feed-post-card.tsx")
    )
);
check(
  "the renderer's entity matcher is built from the same pattern",
  /POST_URL_SOURCE/.test(content)
);

for (const [text, want] of [
  ["https://example.com/x", "https://example.com/x"],
  ["www.example.com", "https://www.example.com"],
  ["example.com", "https://example.com"],
  ["example.com/path?q=1", "https://example.com/path?q=1"],
  ["visit example.com.", "https://example.com"],
  ["visit example.com, then", "https://example.com"],
  ["sub.domain.co.uk/x", "https://sub.domain.co.uk/x"],
  ["check youtu.be/abc", "https://youtu.be/abc"],
  ["bit.ly/xyz", "https://bit.ly/xyz"],
] as const) {
  check(
    `finds ${JSON.stringify(text)}`,
    (findFirstUrl(text)?.href ?? null) === want,
    `got ${findFirstUrl(text)?.href ?? null}`
  );
}
// The half that matters more: prose must not turn into links.
for (const text of [
  "mail me at bob@example.com",
  "the end.Next thing",
  "I finished.Me too",
  "that.is fine",
  "version 2.5 beta",
  "file.txt is here",
  "hello world",
  "a.b",
] as const) {
  check(
    `leaves ${JSON.stringify(text)} alone`,
    findFirstUrl(text) === null,
    `matched ${findFirstUrl(text)?.href}`
  );
}
check(
  "several links in one post are all found, in order",
  JSON.stringify(
    findUrls("a example.com and https://b.io/x").map((u) => u.href)
  ) === JSON.stringify(["https://example.com", "https://b.io/x"])
);
check(
  "the label keeps what the author typed",
  /urlLabel\(shown\)/.test(content) && /https:\/\/\$\{shown\}/.test(content),
  "the href gets the scheme; the visible text should not suddenly grow one"
);

/* ── 5. The profile column ── */
console.log("\n5. The profile column");
const profile = code("src/components/user/profile/profile-tab-body.tsx");
check(
  "the completion list has no inner scrollbar",
  !/max-h-44 overflow-y-auto/.test(profile)
);
check(
  "…and no longer hides items past the eighth",
  /completion\.missing\.map\(/.test(profile) &&
    !/completion\.missing\.slice\(0, 8\)/.test(profile)
);
// Where those two cards live is asserted in
// `verify-profile-layout-and-public.ts` now. They spent one commit inside the
// 1/3 column, which fixed the void under it and created a worse one down the
// right of the page; they sit in a full-width two-up row below the grid
// instead. Two suites checking the same arrangement from opposite directions is
// how one of them ends up pinning the arrangement that was replaced.
check(
  "the two big cards are out of the 1/3 column",
  // Anchored on real code, not on a comment: `code()` strips comments, so
  // `indexOf("Right rail")` was -1 and the slice ran to the end of the file.
  !profile
    .slice(
      profile.indexOf('title="Profile Completion"'),
      profile.indexOf('lg:col-span-2')
    )
    .includes('title="Verification & Security"')
);

/* ── 6. The auth noise ── */
console.log("\n6. The stale-cookie auth error");
const auth = code("src/lib/auth/index.ts");
check(
  "a stale session cookie logs as a warning, not three red errors",
  /JWTSessionError/.test(auth) && /console\.warn\(/.test(auth)
);
check(
  "every other auth error still logs loudly",
  /console\.error\(err\)/.test(auth)
);
check(
  "the session wrapper still treats it as signed out",
  /return await auth\(\);/.test(auth) && /return null;/.test(auth)
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
