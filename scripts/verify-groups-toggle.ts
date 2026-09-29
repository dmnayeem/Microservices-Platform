import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  CATEGORY_FOR_KEY,
  SETTING_GROUPS,
  settingEntry,
} from "../src/lib/admin-settings-catalog";

/**
 * Groups behind an admin switch, shipped off.
 *
 * The failure this guards against is a **fake off**. Groups reaches the database
 * through six API handlers across five route files plus a detail page; hiding
 * the tab alone leaves every one of them open to anyone holding a group URL or
 * a saved request. So the checks below count the guards from source — a seventh
 * route added later without one fails here rather than quietly reopening the
 * feature.
 *
 * The other half is that nothing is destroyed: no migration, no delete, and the
 * groups already in the database are still there for when it is switched on.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-groups-toggle.ts
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
/** Source with comments stripped, so prose can't satisfy a rule. */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const GROUP_ROUTES = [
  "src/app/api/groups/route.ts",
  "src/app/api/groups/[id]/route.ts",
  "src/app/api/groups/[id]/join/route.ts",
  "src/app/api/groups/[id]/leave/route.ts",
  "src/app/api/groups/[id]/requests/[reqId]/route.ts",
];

async function main() {
  console.log("\n=== Groups toggle ===\n");

  /* ── 1. The flag ── */
  console.log("1. The switch exists and ships off");
  {
    const t = code("src/lib/ui-toggles-server.ts");
    check("getUiToggles exposes groupsEnabled", /groupsEnabled: boolean/.test(t));
    check(
      "it is keyed ui.groups_enabled",
      /groupsEnabled: "ui\.groups_enabled"/.test(t)
    );
    // The whole point of the change. A later edit flipping this to true would
    // silently switch the feature on for everyone.
    check(
      "it defaults to OFF",
      /\/\/[\s\S]*?groupsEnabled: false,/.test(read("src/lib/ui-toggles-server.ts")) ||
        /groupsEnabled: false,/.test(t)
    );
    check(
      "the default really is false, not true",
      !/groupsEnabled: true/.test(t)
    );
    check(
      "it is read from the settings map like the others",
      /groupsEnabled: asBool\(map\.get\(KEYS\.groupsEnabled\), DEFAULTS\.groupsEnabled\)/.test(
        t
      )
    );

    const gate = code("src/lib/groups-gate.ts");
    check(
      "there is one shared guard, not six copies of the check",
      /export async function groupsDisabled/.test(gate) &&
        /export async function isGroupsEnabled/.test(gate)
    );
    check("the guard answers 403 when off", /status: 403/.test(gate));
  }

  /* ── 2. The server ── */
  console.log("\n2. Off means off, on the server");
  {
    let handlers = 0;
    let guarded = 0;
    const unguarded: string[] = [];
    for (const f of GROUP_ROUTES) {
      const src = code(f);
      const h = (src.match(/^export async function (GET|POST|PATCH|PUT|DELETE)/gm) ?? []).length;
      const g = (src.match(/const off = await groupsDisabled\(\);/g) ?? []).length;
      handlers += h;
      guarded += g;
      if (g < h) unguarded.push(`${f} (${g}/${h})`);
    }
    check("all five group route files were found", GROUP_ROUTES.every((f) => fs.existsSync(path.join(root, f))));
    check(`every handler is guarded (${guarded}/${handlers})`, guarded >= handlers && handlers === 6, unguarded.join(", "));
    check(
      "the guard runs before the handler does any work",
      GROUP_ROUTES.every((f) => {
        const src = code(f);
        return src.indexOf("groupsDisabled()") < src.indexOf("prisma.");
      })
    );
    // A bookmarked group URL must not be a way back in.
    const page = code("src/app/(main)/groups/[id]/page.tsx");
    check(
      "the group detail page redirects when off",
      /isGroupsEnabled\(\)\)\) redirect\("\/social"\)/.test(page)
    );
    check(
      "it redirects before it looks the group up",
      page.indexOf("isGroupsEnabled") < page.indexOf("prisma.group")
    );
  }

  /* ── 3. The UI ── */
  console.log("\n3. The tab is gone, and gone cleanly");
  {
    const v = code("src/components/user/feed/social-feed-view.tsx");
    check(
      "the Groups tab is no longer hardcoded into the tab list",
      !/\{ key: "groups", label: "Groups", icon: Users \},\s*\]/.test(v)
    );
    check(
      "the tab only exists when the flag is on",
      /groupsEnabled\s*\?\s*\[\{ key: "groups"/.test(v)
    );
    // Matched on the GUARD, not on the whole JSX line. The original pinned the
    // exact string `&& <GroupsTab />}`, so wrapping the tab in a fragment to add
    // a banner broke the test while the guard itself was untouched — a test that
    // fails for a reason it does not care about teaches people to edit the test.
    check(
      "GroupsTab cannot mount with the flag off",
      /\{groupsEnabled && activeTab === "groups" &&/.test(v) &&
        // …and there is no OTHER mount that skips the guard.
        (v.match(/<GroupsTab\s*\/>/g) ?? []).length === 1
    );
    // With one tab left, a tab strip is worse than none — that strip is exactly
    // what the owner screenshotted.
    check(
      "the tab strip is hidden when only one tab remains",
      /\{tabs\.length > 1 && \(/.test(v)
    );
    // A stale `groups` tab state must fall back rather than render nothing.
    check(
      "a stale Groups selection falls back to the feed",
      /const activeTab: ViewTab = tabs\.some\(\(t\) => t\.key === tab\) \? tab : "feed"/.test(
        v
      )
    );
    check(
      "the flag defaults to off in the component too",
      /groupsEnabled = false,/.test(v)
    );
    check(
      "the page reads it server-side and passes it down",
      // `isGroupsEnabled()` moved into the page's single Promise.all when six
      // sequential awaits were collapsed into one — it is destructured now
      // rather than assigned on its own line. Still read on the server, still
      // passed down; that is the rule, and the await shape is not.
      /isGroupsEnabled\(\)/.test(code("src/app/(main)/social/page.tsx")) &&
        /groupsEnabled,/.test(code("src/app/(main)/social/page.tsx")) &&
        /groupsEnabled=\{groupsEnabled\}/.test(code("src/app/(main)/social/page.tsx"))
    );
  }

  /* ── 4. The admin control ── */
  console.log("\n4. The owner can turn it back on");
  {
    // Phase 3b: the switch moved from System Settings → Site toggles to Feed
    // settings → General. Same key, same row category, same checks.
    const f = code("src/components/admin/settings/feed-general-panel.tsx");
    check('the key is in DEFAULTS as false', /"ui\.groups_enabled": false/.test(f));
    // Asserted against the real map rather than the literal that used to be
    // hand-written in the form. The mapping moved into the settings catalog and
    // is derived from it now; what matters is that Save still files this key
    // under a category, because a key missing from the map renders, accepts
    // input, says "saved" and writes nothing.
    check(
      "the key is mapped to the ui_toggles category so it saves",
      CATEGORY_FOR_KEY["ui.groups_enabled"] === "ui_toggles"
    );
    check(
      "…and it carries a label and a description an admin can act on",
      (settingEntry("ui.groups_enabled")?.description?.length ?? 0) > 20
    );
    // `!== false` is the default-ON form and would show an unset value as on.
    check(
      "the Toggle uses the default-OFF comparison",
      /checked=\{values\["ui\.groups_enabled"\] === true\}/.test(f)
    );
    check(
      "it writes back to the same key",
      /onChange=\{\(v\) => set\("ui\.groups_enabled", v\)\}/.test(f)
    );
    // A feature switch filed under a tab labelled "Popups" is one nobody finds.
    // The point was never the word "Toggles" — it was that a feature switch
    // must not be filed under a tab called "Popups", which is where nobody
    // looks for it. Assert the property, not the wording.
    check(
      "the tab is not labelled Popups",
      (() => {
        const g = SETTING_GROUPS.find((x) => x.id === "ui_toggles");
        return !!g && !/popup/i.test(g.label);
      })()
    );
    // The dead CATEGORY_CONFIG surface is gone entirely. It was a second,
    // unreachable settings UI (nothing linked to `/admin/settings/<category>`)
    // writing a rival key namespace — `site_name` beside `platform_name`,
    // `smtp_user` beside `smtp_username`. It was also the ONLY editor for
    // `allow_withdrawals`, so the withdrawal kill-switch had no reachable UI.
    check(
      "the rival CATEGORY_CONFIG settings surface no longer exists",
      !fs.existsSync(path.join(root, "src/app/admin/settings/[category]/page.tsx"))
    );
  }

  /* ── 5. Nothing was destroyed ── */
  console.log("\n5. The data is intact");
  {
    const migrations = fs
      .readdirSync(path.join(root, "prisma/migrations"))
      .filter((d) => fs.existsSync(path.join(root, "prisma/migrations", d, "migration.sql")))
      .filter((d) => {
        const sql = read(`prisma/migrations/${d}/migration.sql`);
        return /DROP TABLE "(Group|GroupMember|GroupJoinRequest)"/i.test(sql);
      });
    check("no migration drops a group table", migrations.length === 0, migrations.join(", "));

    const schema = read("prisma/schema.prisma");
    check(
      "the models are all still declared",
      /model Group \{/.test(schema) &&
        /model GroupMember \{/.test(schema) &&
        /model GroupJoinRequest \{/.test(schema)
    );

    const [groups, members] = await Promise.all([
      prisma.group.count(),
      prisma.groupMember.count(),
    ]);
    // Reported, not asserted — the point is that the rows survive the switch.
    console.log(
      `       (live: ${groups} group${groups === 1 ? "" : "s"}, ${members} membership${
        members === 1 ? "" : "s"
      } — kept, and back as soon as the toggle is on)`
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
  .finally(() => prisma.$disconnect());
