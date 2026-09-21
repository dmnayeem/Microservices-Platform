/**
 * verify-theme-control — the admin's two theme settings, end to end.
 *
 * This platform has shipped 44 settings that wrote a row nothing read, and one
 * that wrote `withdrawal_fee_pct` while payouts read `withdrawal_fee_percent`.
 * Both are the same bug: the control and the code drifted apart. So this suite
 * does not check that a switch exists. It checks that the key the admin form
 * writes is the key the server reads, that the category it saves under is the
 * category the reader queries, that the pre-paint script obeys both settings,
 * and that a user cannot change the theme by any surviving route when the
 * admin has said no.
 *
 * Run:  npx tsx --tsconfig tsconfig.script.json scripts/verify-theme-control.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(label + (detail ? ` — ${detail}` : ""));
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const KEY_DEFAULT = "ui.theme_default";
const KEY_CHOICE = "ui.theme_user_choice";

const catalog = read("src/lib/admin-settings-catalog.ts");
const server = read("src/lib/ui-toggles-server.ts");
const form = read("src/components/admin/settings/system-settings-form.tsx");
const layout = read("src/app/layout.tsx");
const provider = read("src/components/providers/theme-provider.tsx");
const sw = read("src/components/dashboard/theme-switch.tsx");
const saveRoute = read("src/app/api/admin/settings/route.ts");

console.log("\nverify-theme-control\n");

/* ══════════════════════════════════════════════════════════════════════════
   1. One key, everywhere it appears
   ══════════════════════════════════════════════════════════════════════════ */
for (const key of [KEY_DEFAULT, KEY_CHOICE]) {
  check(`${key} is in the settings catalog`, catalog.includes(`"${key}"`));
  check(`${key} is read by the server`, server.includes(`"${key}"`));
  check(`${key} has a control in the admin form`, form.includes(`"${key}"`));
}

/* The reader queries one category; the form derives the save category from the
   catalog's `group`. If the group is not that category, Save reports success
   and the reader never sees the row. */
check(
  "the reader queries the category the catalog files these under",
  /category:\s*"ui_toggles"/.test(server) &&
    new RegExp(`key:\\s*"${KEY_DEFAULT}",\\s*group:\\s*"ui_toggles"`).test(catalog) &&
    new RegExp(`key:\\s*"${KEY_CHOICE}",\\s*group:\\s*"ui_toggles"`).test(catalog),
  "a group that is not ui_toggles means Save writes a row getUiToggles never reads"
);

/* ══════════════════════════════════════════════════════════════════════════
   2. Saving takes effect now, not in a minute
   ══════════════════════════════════════════════════════════════════════════
   getUiToggles memoizes for 60s in-process. Without an explicit drop on save,
   an admin flips the switch and nothing changes — indistinguishable from a
   control that does nothing. */
check(
  "the reader exposes a cache invalidator",
  /export function invalidateUiTogglesCache/.test(server)
);
check(
  "the settings save route calls it",
  /invalidateUiTogglesCache\(\)/.test(saveRoute)
);

/* ══════════════════════════════════════════════════════════════════════════
   3. The pre-paint script obeys both settings
   ══════════════════════════════════════════════════════════════════════════
   This script runs before React, before any fetch, before the provider mounts.
   Anything it cannot see synchronously arrives a frame late and shows as a
   flash of the wrong theme, so both settings must be baked into it as
   literals. */
const script =
  layout.match(/__html:\s*`([^`]*data-theme[^`]*)`/)?.[1] ?? "";
check("the pre-paint script is still present", script.length > 0);
check(
  "it takes the admin default, not a hardcoded one",
  script.includes("${JSON.stringify(") || /\$\{[^}]*themeDefault/.test(layout),
  "a literal 'dark' here ignores the admin's setting until React mounts"
);
check(
  "it is told whether the user may choose",
  /\$\{ui\.themeUserChoice\}/.test(layout)
);
check(
  "with choice off it does not read the stored preference at all",
  /C\?\(localStorage\.getItem\('earngpt-theme'\)\|\|D\):D/.test(script),
  "reading it and then overriding would paint the user's theme first, then flip"
);
check(
  "the provider is given both",
  /defaultTheme=\{ui\.themeDefault\}/.test(layout) &&
    /allowUserChoice=\{ui\.themeUserChoice\}/.test(layout)
);

/* ══════════════════════════════════════════════════════════════════════════
   4. A refusal that holds even if a control survives
   ══════════════════════════════════════════════════════════════════════════
   Hiding a button is a UI decision; it is not a guarantee. The provider has to
   refuse as well, or any surface that renders its own toggle quietly keeps
   working after the admin turns choice off. */
check(
  "setTheme refuses when choice is off",
  /const setTheme = \([^)]*\) => \{\s*if \(!allowUserChoice\) return;/.test(provider)
);
check(
  "the stored preference is not hydrated when choice is off",
  /allowUserChoice\s*\?\s*\(localStorage\.getItem\(storageKey\)/.test(provider)
);
check(
  "the flag reaches consumers through the context",
  /canChangeTheme:\s*allowUserChoice/.test(provider) &&
    /canChangeTheme: boolean/.test(provider)
);

/* ══════════════════════════════════════════════════════════════════════════
   5. Every surface that offers the choice hides it
   ══════════════════════════════════════════════════════════════════════════
   A picker that silently refuses reads as a broken app, not as a policy. */
check(
  "the header switch renders nothing when choice is off",
  /canChangeTheme/.test(sw) && /if \(!canChangeTheme\) return null;/.test(sw)
);
for (const [file, label] of [
  ["src/components/user/settings/settings-view.tsx", "Settings"],
  ["src/components/user/profile/profile-edit-tabs.tsx", "the profile Appearance tab"],
] as const) {
  const body = read(file);
  check(
    `${label} hides its theme picker when choice is off`,
    /canChangeTheme/.test(body) && /hidden=\{!canChangeTheme\}/.test(body)
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   6. Defaults preserve today's behaviour
   ══════════════════════════════════════════════════════════════════════════
   An install with no rows saved must behave exactly as it did before these
   settings existed: dark, and the user may choose. */
check(
  "the server defaults to dark with choice allowed",
  /themeDefault:\s*"dark"/.test(server) && /themeUserChoice:\s*true/.test(server)
);
check(
  "the admin form starts from the same two values",
  /"ui\.theme_default":\s*"dark"/.test(form) &&
    /"ui\.theme_user_choice":\s*true/.test(form)
);
/* A missing row must not read as "off". `!== false` is the difference between
   an unsaved install keeping the switch and losing it. */
check(
  "an unsaved choice setting counts as allowed, not denied",
  /values\["ui\.theme_user_choice"\] !== false/.test(form)
);
/* And the value must be validated on the way in: a stray string in the JSON
   column must not become a data-theme attribute. */
check(
  "an unrecognised stored theme falls back instead of being applied",
  /unwrapped === "light" \|\| unwrapped === "dark" \? unwrapped : fallback/.test(
    server
  )
);

console.log(
  `\n${passed} passed, ${failed} failed\n` +
    (failures.length ? failures.map((f) => `  · ${f}`).join("\n") + "\n" : "")
);
if (failed > 0) process.exitCode = 1;
