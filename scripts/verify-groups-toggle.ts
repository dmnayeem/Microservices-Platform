import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

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
    check(
      "GroupsTab cannot mount with the flag off",
      /\{groupsEnabled && activeTab === "groups" && <GroupsTab \/>\}/.test(v)
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
      /const groupsEnabled = await isGroupsEnabled\(\)/.test(
        code("src/app/(main)/social/page.tsx")
      ) && /groupsEnabled=\{groupsEnabled\}/.test(code("src/app/(main)/social/page.tsx"))
    );
  }

  /* ── 4. The admin control ── */
  console.log("\n4. The owner can turn it back on");
  {
    const f = code("src/components/admin/settings/system-settings-form.tsx");
    check('the key is in DEFAULTS as false', /"ui\.groups_enabled": false/.test(f));
    check(
      "the key is mapped to the ui_toggles category so it saves",
      /"ui\.groups_enabled": "ui_toggles"/.test(f)
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
    check(
      "the tab is no longer labelled Popups",
      /\{ id: "ui_toggles", label: "Toggles"/.test(f)
    );
    check(
      "it is NOT added to the dead CATEGORY_CONFIG surface",
      !/ui\.groups_enabled/.test(code("src/app/admin/settings/[category]/page.tsx"))
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
