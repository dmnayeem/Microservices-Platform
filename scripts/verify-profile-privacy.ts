import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  PRIVACY_FIELDS,
  PRIVACY_LABELS,
  canSee,
  effectivePrivacy,
  parsePrivacyFields,
  privacyLevelFor,
  visibleTo,
} from "../src/lib/profile-privacy";

/**
 * Per-field profile visibility: Everyone / Followers / Only me.
 *
 * The dangerous failure here is not a crash, it is a lie — a settings page that
 * says "Only me" over a field the API still publishes. So the tests are weighted
 * toward the gate itself: every controllable field must be enforced by name, the
 * settings page must offer exactly the fields the API honours, and "Followers"
 * must mean MUTUAL in both places.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-profile-privacy.ts
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

console.log("\n=== Per-field profile privacy ===\n");

/* ── 1. The three levels ── */
console.log("1. What each level means");
const me = { isMe: true, isMutual: false };
const mutual = { isMe: false, isMutual: true };
const stranger = { isMe: false, isMutual: false };
check("PUBLIC is visible to a stranger", canSee("PUBLIC", stranger));
check("PRIVATE is hidden from a stranger", !canSee("PRIVATE", stranger));
check("PRIVATE is hidden from a follower too", !canSee("PRIVATE", mutual));
check(
  "FRIENDS needs the follow to go BOTH ways",
  canSee("FRIENDS", mutual) && !canSee("FRIENDS", stranger),
  "a one-way follower is not somebody you chose"
);
check(
  "the owner always sees their own profile",
  canSee("PRIVATE", me) && canSee("FRIENDS", me)
);
check(
  'the labels say "Only me", not "PRIVATE"',
  PRIVACY_LABELS.PRIVATE === "Only me" &&
    PRIVACY_LABELS.FRIENDS === "Followers" &&
    PRIVACY_LABELS.PUBLIC === "Everyone"
);

/* ── 2. Resolving a level ── */
console.log("\n2. Resolving a level");
const blank = {};
check(
  "an untouched field falls back to its default",
  privacyLevelFor(blank, "profession") === "PUBLIC" &&
    privacyLevelFor(blank, "earnings") === "PRIVATE" &&
    privacyLevelFor(blank, "location") === "FRIENDS"
);
check(
  "defaults match what is live today, so nothing hides itself on deploy",
  PRIVACY_FIELDS.filter((f) => !f.column).every((f) => f.fallback === "PUBLIC"),
  "these fields are public right now; silently hiding somebody's profession would be a change they did not ask for"
);
check(
  "a legacy column still wins for its own field",
  privacyLevelFor({ privacyBio: "PRIVATE" }, "bio") === "PRIVATE",
  "two sources for one answer must have a stated winner"
);
check(
  "…even when the JSON map disagrees",
  privacyLevelFor(
    { privacyBio: "PRIVATE", privacyFields: { bio: "PUBLIC" } },
    "bio"
  ) === "PRIVATE"
);
check(
  "the JSON map drives everything else",
  privacyLevelFor({ privacyFields: { gender: "PRIVATE" } }, "gender") ===
    "PRIVATE"
);
check(
  "junk in the column cannot loosen a field",
  privacyLevelFor({ privacyFields: { gender: "EVERYONE" } }, "gender") ===
    "PUBLIC" &&
    Object.keys(parsePrivacyFields({ gender: "EVERYONE" })).length === 0,
  "an unrecognised level falls back to the default rather than being trusted"
);
check(
  "unknown keys are dropped, not stored",
  Object.keys(parsePrivacyFields({ notAField: "PRIVATE" })).length === 0,
  "a stale key is a setting the user believes is doing something"
);
check(
  "every field resolves for the settings page",
  Object.keys(effectivePrivacy(blank)).length === PRIVACY_FIELDS.length
);
check(
  "visibleTo is the whole decision in one call",
  visibleTo({ privacyFields: { gender: "FRIENDS" } }, "gender", mutual) &&
    !visibleTo({ privacyFields: { gender: "FRIENDS" } }, "gender", stranger) &&
    visibleTo({ privacyEarnings: "PRIVATE" }, "earnings", me),
  "routes call this one function; if it drifted from canSee+privacyLevelFor the gate would pass its own tests and still leak"
);

/* ── 3. The gate is actually applied ── */
console.log("\n3. Every field is enforced, by name");
const api = code("src/app/api/users/[id]/profile/route.ts");
for (const key of [
  "profession",
  "nationality",
  "language",
  "gender",
  "dateOfBirth",
  "bloodGroup",
  "maritalStatus",
  "studyLevel",
  "timezone",
  "socialAccounts",
  "creations",
]) {
  check(
    `${key} goes through the gate`,
    new RegExp(`show\\("${key}"\\)`).test(api),
    "a control the API does not honour is worse than no control"
  );
}
check(
  "the legacy five still use their columns",
  /showByPrivacy\(u\.privacyAvatar\)/.test(api) &&
    /showByPrivacy\(u\.privacyBio\)/.test(api) &&
    /showByPrivacy\(u\.privacyLocation\)/.test(api) &&
    /showByPrivacy\(u\.privacyStats\)/.test(api)
);
check(
  "both gates end at the same rule",
  /canSee\(/.test(api) && /visibleTo\(u, key, viewerCtx\)/.test(api),
  '"Followers" must mean mutual in one place, not two'
);
check(
  "connected accounts no longer ride on the bio switch",
  !/socialAccounts: showByPrivacy\(u\.privacyBio\)/.test(api),
  "hiding your bio should not also hide your linked accounts — two unrelated decisions on one control"
);

/* ── 4. Saving a choice ── */
console.log("\n4. Saving a choice");
const profileApi = code("src/app/api/profile/route.ts");
check(
  "the settings page is told the level in force for every field",
  /privacyFields: effectivePrivacy\(u\)/.test(profileApi)
);
check(
  "a saved change is MERGED, not replaced",
  /\{ \.\.\.current, \.\.\.incoming \}/.test(profileApi),
  "the page sends one changed key at a time; replacing would wipe every other choice"
);
check(
  "what is saved is sanitised first",
  /parsePrivacyFields\(body\.privacyFields\)/.test(profileApi)
);
check(
  "the merge read only happens when privacy is actually being changed",
  /if \(body\.privacyFields !== undefined\) \{[\s\S]{0,400}findUnique/.test(
    profileApi
  ),
  "an unrelated settings save should not pay for the query"
);

/* ── 5. The control the user sees ── */
console.log("\n5. The control");
const tab = code("src/components/user/profile/profile-edit-tabs.tsx");
check(
  "the settings page renders the same catalogue the API enforces",
  /PRIVACY_FIELDS/.test(tab) && /PRIVACY_GROUPS/.test(tab),
  "a hand-listed second copy is how a field ends up settable but not enforced"
);
check(
  "all three levels are offered",
  /PRIVACY_LEVELS\.map/.test(tab) && /PRIVACY_LABELS\[l\]/.test(tab)
);
check(
  "a legacy field writes its column, the rest write the map",
  /f\.column \? \{ \[f\.column\]: next \} : \{ privacyFields: \{ \[f\.key\]: next \} \}/.test(
    tab
  ),
  "one control either way — the user should not have to know which of their settings has a column behind it"
);
check(
  "the change shows immediately and rolls back if the save fails",
  /setLevels\(\(p\) => \(\{ \.\.\.p, \[f\.key\]: next \}\)\)/.test(tab) &&
    /if \(!ok\) setLevels/.test(tab),
  "a select that snaps back mid-flight reads as 'that did not work'"
);
check(
  '"Followers" is explained where it is chosen',
  /follow you back/.test(tab),
  "otherwise nobody can tell whether a one-way follower counts"
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
