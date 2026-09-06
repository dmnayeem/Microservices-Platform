import "dotenv/config";
import fs from "fs";
import path from "path";
import {
  TASK_ACTION_LABEL,
  TASK_REMOVAL_ACTIONS,
  taskSnapshot,
  readTaskSnapshot,
  taskActionTone,
} from "../src/lib/task-audit";
import {
  calculateProfileCompletion,
  UNLOCK_REQUIRED,
} from "../src/lib/profile-completion";
import { DEFAULT_REACTION, reactionMeta } from "../src/lib/reactions";

/**
 * Four items: task accountability, profile-completion destinations, Love-only
 * reactions, and tap targets.
 *
 * The task half is weighted toward one question — can you still answer "who
 * removed this" AFTER the task is gone? A test that only checks the audit call
 * exists would pass on a design that stores nothing but an id, which is exactly
 * the design that fails the moment the row is deleted.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-task-audit-and-feed.ts
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const exists = (p: string) => fs.existsSync(path.join(root, p));

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

console.log("\n=== Task accountability · profile targets · feed reactions ===\n");

/* ─────────────────────────────────────────────────────────────
   1. Who made it, who removed it
   ───────────────────────────────────────────────────────────── */
console.log("1. Task lifecycle is recorded");

const del = code("src/app/api/admin/tasks/[id]/route.ts");
check(
  "deleting a task is recorded at all",
  /TASK_DELETED/.test(del),
  "the DELETE handler wrote nothing — a task could vanish with no trace of who removed it"
);
check(
  "archiving is a DIFFERENT event from deleting",
  /TASK_ARCHIVED/.test(del) && /TASK_DELETED/.test(del),
  "one is reversible and the task is still there; the other is not. Collapsing them loses that"
);
check(
  "the snapshot is read BEFORE the row is destroyed",
  del.indexOf("const existingTask = await prisma.task.findUnique") <
    del.indexOf("prisma.task.delete"),
  "after the delete there is nothing left to read"
);
check(
  "the snapshot carries what the task WAS, not just its id",
  /title: true,[\s\S]{0,200}type: true,[\s\S]{0,200}pointsReward: true/.test(del),
  '"who deleted task cmxyz…" is not an answer anybody can use'
);
check(
  "the delete audit is written AFTER the delete succeeds",
  del.indexOf("prisma.task.delete") < del.lastIndexOf("TASK_DELETED"),
  "the log must not claim a removal that failed"
);
check(
  "a status change (pause/resume) is recorded too",
  /TASK_STATUS_CHANGED/.test(del),
  "pausing removes a task from every user-facing list just as archiving does"
);
check(
  "the status summary says what changed, both sides",
  /\$\{existingTask\.status\} → \$\{newStatus\}/.test(del)
);

check(
  "creating a task records a snapshot and a readable line",
  /TASK_CREATED/.test(code("src/app/api/admin/tasks/route.ts")) &&
    /taskSnapshot\(task\)/.test(code("src/app/api/admin/tasks/route.ts")) &&
    /summary: `Created/.test(code("src/app/api/admin/tasks/route.ts"))
);
const dup = code("src/app/api/admin/tasks/[id]/duplicate/route.ts");
check(
  "duplicating is recorded, and says what it was copied from",
  /TASK_DUPLICATED/.test(dup) && /copiedFromTaskId/.test(dup),
  "a plain TASK_CREATED would lose the link back to the original"
);
const rev = code("src/app/api/admin/tasks/[id]/review/route.ts");
check(
  "both review decisions are recorded",
  /decision: "approve"/.test(rev) && /decision: "reject"/.test(rev)
);
check(
  "a rejection records the refund",
  /refundUsd/.test(rev) && /TASK_REVIEWED/.test(rev)
);

/* ── the snapshot round-trips ── */
console.log("\n2. The snapshot survives the task");
const snap = taskSnapshot({
  id: "t1",
  title: "Watch this video",
  status: "ACTIVE",
  type: "VIDEO",
  pointsReward: 50,
  xpReward: 5,
  completedCount: 12,
  createdById: "admin1",
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
});
check(
  "a snapshot names the task in words",
  snap.title === "Watch this video" && snap.type === "VIDEO"
);
check(
  "…and records what it paid and how many finished it",
  snap.pointsReward === 50 && snap.completedCount === 12,
  "whether removing it mattered depends on both"
);
check(
  "dates are serialised, not left as Date objects",
  typeof snap.createdAt === "string",
  "it goes through JSON into a jsonb column"
);
const back = readTaskSnapshot(JSON.parse(JSON.stringify(snap)));
check(
  "it reads back out of the audit row",
  back?.title === "Watch this video" && back?.pointsReward === 50
);
check(
  "a row with no snapshot returns null rather than a fake one",
  readTaskSnapshot(null) === null &&
    readTaskSnapshot({ nothing: "useful" }) === null,
  "invented placeholder values would read as real data"
);
check(
  "both removal actions are catalogued",
  TASK_REMOVAL_ACTIONS.includes("TASK_DELETED") &&
    TASK_REMOVAL_ACTIONS.includes("TASK_ARCHIVED")
);
check(
  "removal is coloured as removal",
  taskActionTone("TASK_DELETED").includes("red") &&
    taskActionTone("TASK_ARCHIVED").includes("amber"),
  "an admin scanning the list should not have to read the label to see a task went away"
);
check(
  "every action has a plain-language label",
  TASK_ACTION_LABEL.TASK_DELETED === "Deleted" &&
    TASK_ACTION_LABEL.TASK_CREATED === "Created"
);

/* ─────────────────────────────────────────────────────────────
   3. Admins can see it. Users cannot.
   ───────────────────────────────────────────────────────────── */
console.log("\n3. Admin-only, and actually readable");

const hist = code("src/app/api/admin/tasks/[id]/history/route.ts");
check("there is a per-task history endpoint", exists("src/app/api/admin/tasks/[id]/history/route.ts"));
check(
  "it requires an admin permission",
  /can\(session\.user\.id, "tasks\.view"\)/.test(hist),
  "which admin edited a task is internal — a person doing the task has no part in it"
);
check(
  "it resolves actor names instead of returning cuids",
  /prisma\.user\.findMany/.test(hist) && /actorMap/.test(hist),
  "a history that lists ids is not a history anybody can read"
);

const removedPage = code("src/app/admin/tasks/removed/page.tsx");
check("there is a Removed Tasks page", exists("src/app/admin/tasks/removed/page.tsx"));
check(
  "it is admin-gated",
  /can\(session\.user\.id, "tasks\.view"\)/.test(removedPage)
);
check(
  "it reads the audit log, not the task table",
  /prisma\.auditLog\.findMany/.test(removedPage),
  "a deleted task has no row to list — that is the whole reason this page exists"
);
check(
  "it only links tasks that still exist",
  /alive\.has\(r\.entityId\)/.test(removedPage),
  "linking a hard-deleted task would 404"
);
check(
  "it separates deleted from archived",
  /kind === "deleted"/.test(removedPage) && /kind === "archived"/.test(removedPage)
);
check(
  "both admin surfaces say they are admin-only on screen",
  /Admins only/.test(removedPage) &&
    /Admins only/.test(code("src/components/admin/tasks/task-history-panel.tsx"))
);

const adminTasks = code("src/app/admin/tasks/page.tsx");
check(
  "the task list shows the creator's NAME",
  /creatorMap/.test(adminTasks) && /Created by/.test(adminTasks),
  "it printed the raw cuid — technically the answer, practically unreadable"
);
check(
  "…on every task, not only the ones awaiting review",
  adminTasks.indexOf("Created by") <
    adminTasks.indexOf('{task.status === "PENDING_REVIEW" && ('),
  "the creator line has to sit OUTSIDE the pending-review block, above it"
);
check(
  "an admin-made task is distinguishable from a user-made one",
  /isStaff/.test(adminTasks),
  "self-serve tasks have a normal user in createdById — showing them alike is misleading"
);
check(
  "tasks with no recorded creator say so",
  /not recorded/.test(adminTasks),
  "a bare dash reads like a loading failure"
);
check(
  "the Removed view is reachable from the task list",
  /\/admin\/tasks\/removed/.test(adminTasks),
  "a deleted task leaves no card, so the only way in is a link that does not depend on it"
);

/* ── the leak side ── */
const userTasks = code("src/app/api/tasks/route.ts");
check(
  "the user task list selects explicit columns",
  /select: \{[\s\S]{0,900}pointsReward: true/.test(userTasks),
  "it fetched every column, so createdById rode along on every user's task list"
);
check(
  "…and createdById is not among them",
  !/createdById/.test(userTasks),
  "which admin made a task is not a user's business"
);
for (const f of [
  "src/app/api/tasks/route.ts",
  "src/app/api/tasks/[id]/route.ts",
  "src/app/api/tasks/quiz/route.ts",
  "src/app/api/tasks/social/route.ts",
  "src/app/api/tasks/summary/route.ts",
]) {
  check(
    `${f.replace("src/app/api/", "")} leaks no creator field`,
    !/createdById|createdBy\b/.test(code(f))
  );
}

/* ─────────────────────────────────────────────────────────────
   4. Profile completion points somewhere real
   ───────────────────────────────────────────────────────────── */
console.log("\n4. Completion items go where the field actually is");

const empty = calculateProfileCompletion({});
const byKey = new Map(empty.items.map((i) => [i.key, i]));
check(
  "the profile photo opens the photo picker, not the personal form",
  byKey.get("avatar")?.href === "?modal=photo&which=avatar",
  "it said ?tab=personal — a form with no photo control on it. That was the complaint"
);
check(
  "the cover photo opens the picker for the cover",
  byKey.get("coverPhoto")?.href === "?modal=photo&which=coverPhoto"
);
check(
  "tags open the tag picker",
  byKey.get("tags")?.href === "?modal=tags",
  "also a modal, also previously pointed at the personal tab"
);
check(
  "the National ID goes to the tab it is actually on",
  byKey.get("nidNumber")?.href === "?tab=personal&field=nidNumber",
  "it pointed at the KYC tab; the field lives on Personal"
);
check(
  "email/phone verification go to their own pages",
  byKey.get("emailVerified")?.href === "/verify-email" &&
    byKey.get("phoneVerified")?.href === "/verify-phone",
  "no profile tab has a verification control, so pointing at one is a different wrong door"
);
check(
  "named fields carry an anchor",
  ["firstName", "lastName", "bio", "gender", "dateOfBirth", "phone"].every(
    (k) => byKey.get(k)?.href?.includes("&field=")
  )
);
check(
  "address items claim no anchor they do not have",
  ["country", "city", "street", "postalCode"].every(
    (k) => byKey.get(k)?.href === "?tab=address"
  ),
  "the address tab is one shared picker — claiming a per-field anchor would be the same lie in a new place"
);
check(
  "the unlock list uses the same destinations",
  UNLOCK_REQUIRED.find((i) => i.key === "avatar")?.href ===
    "/profile?modal=photo&which=avatar",
  "two lists of the same fields must not disagree about where they live"
);

const editTabs = code("src/components/user/profile/profile-edit-tabs.tsx");
for (const a of ["firstName", "lastName", "dateOfBirth", "gender", "nidNumber", "phone", "bio"]) {
  check(`the ${a} field has its anchor`, new RegExp(`anchor="${a}"`).test(editTabs));
}
const ui = code("src/components/user/profile/profile-ui.tsx");
check(
  "Field renders the anchor as an id",
  /id=\{anchor \? `pf-\$\{anchor\}` : undefined\}/.test(ui)
);
check(
  "…and leaves room for a sticky header when scrolled to",
  /scroll-mt-24/.test(ui)
);

const view = code("src/components/user/profile/profile-view.tsx");
check(
  "the jump handler understands modals",
  /modal === "photo"/.test(view) && /modal === "tags"/.test(view),
  "it only ever read ?tab= and sent everything to the personal form"
);
check(
  "…and full paths",
  /href\.startsWith\("\/"\)/.test(view) && /router\.push\(href\)/.test(view)
);
check(
  "the target field is highlighted, not just scrolled to",
  /pf-highlight/.test(view),
  "without a marker you still have to work out which of a dozen inputs you were sent to"
);
check(
  "a <select> is not focused on arrival",
  /HTMLInputElement \|\| input instanceof HTMLTextAreaElement/.test(view),
  "focusing a select on mobile pops the picker before the user has seen the field"
);
check(
  "the highlight style exists and respects reduced motion",
  /\.pf-highlight/.test(read("src/app/globals.css")) &&
    /prefers-reduced-motion[\s\S]{0,200}pf-highlight/.test(read("src/app/globals.css"))
);

const tabBody = code("src/components/user/profile/profile-tab-body.tsx");
check(
  "progress is shown on the panel you fill the profile in",
  /Profile \{completion\.percentage\}% complete/.test(tabBody),
  "the ring is in the sidebar; on a phone with the drawer open it is far off-screen"
);
check(
  "…and names what to do next",
  /Next: \{completion\.missing/.test(tabBody)
);

/* ─────────────────────────────────────────────────────────────
   5. One reaction, and controls you can actually hit
   ───────────────────────────────────────────────────────────── */
console.log("\n5. Love only, and real tap targets");

check("the default reaction is LOVE", DEFAULT_REACTION === "LOVE");
check(
  "the heart is what a new reaction resolves to",
  reactionMeta(null).type === "LOVE" && reactionMeta(undefined).emoji === "❤️"
);
check(
  "stored legacy reactions still resolve to their own emoji",
  reactionMeta("HAHA").emoji === "😂" && reactionMeta("LIKE").emoji === "👍",
  "rows written while the picker existed must not become unlabelled garbage"
);

const btn = code("src/components/user/feed/reaction-button.tsx");
check(
  "the picker is gone",
  !/REACTIONS\.map/.test(btn) && !/onPick/.test(btn),
  "hold-to-open competed with the scroll that starts the same way"
);
check(
  "the button is its own element, with no wrapper",
  !/<div\s+ref=\{wrapRef\}/.test(btn),
  "the wrapper is why the row's padding never reached this button"
);
check(
  "it has a real tap target",
  /min-w-11 min-h-11/.test(btn),
  "~20x20px is why this control in particular needed pressing twice"
);
check(
  "and drops the browser's double-tap-zoom wait",
  /touch-manipulation/.test(btn)
);

const card = code("src/components/user/feed/feed-post-card.tsx");
check(
  "every action in the row gets a real target",
  /\[&>button\]:min-h-11/.test(card) && /\[&>button\]:min-w-11/.test(card)
);
check(
  "the actions are spaced apart",
  /gap-1\.5 sm:gap-2/.test(card),
  "presses were landing in the 4px gap between them"
);
check(
  "the icons are big enough to aim at",
  !/<MessageCircle className="w-4 h-4"/.test(card) &&
    /<MessageCircle className="w-5 h-5"/.test(card)
);
check(
  "the per-emoji breakdown is gone with the picker",
  !/ReactionBreakdown/.test(card) &&
    !exists("src/components/user/feed/reaction-breakdown.tsx"),
  "with one reaction it would just repeat the same number"
);
check(
  "the count is still shown",
  /post\.likesCount > 0/.test(card)
);

check(
  "double-tap has a usable window",
  /now - prev\.at < 450/.test(card),
  "300ms is tight for a real thumb"
);
check(
  "both taps must land on the same image, near each other",
  /prev\.index === index && near/.test(card),
  "a flick down the feed used to count as a tap pair"
);
check(
  "the pending single-tap is CANCELLED, not out-voted",
  /clearTimeout\(singleTapTimer\.current\)/.test(card),
  "a re-render between the two taps lost the old ref-comparison race"
);
check(
  "double-tap only ever adds a reaction",
  /if \(!post\.isLiked\) void react\(DEFAULT_REACTION\)/.test(card),
  "removing one on a gesture meant to give one is the wrong way for a mistake to go"
);
check(
  "the timer is cleared if the card unmounts mid-gesture",
  /useEffect\(\s*\(\) => \(\) => \{\s*if \(singleTapTimer\.current\)/.test(card),
  "the feed reshuffles; a pending tap must not fire into a dead component"
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
