import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { USER_HOME } from "../src/lib/routes";
import {
  ACCENT_SURFACE,
  DEFAULT_ACCENT,
  accentSurfaceCss,
} from "../src/lib/accent-palette";
import {
  DEFAULT_LANDING_CONTENT,
  withEarnCardLinks,
  withRequiredNavLinks,
} from "../src/lib/landing-content";
import {
  auditLightTheme,
  conflictingOverrides,
  contrast,
  lstar,
  paletteTable,
  redundantOverrides,
  toHex,
  type Finding,
} from "./verify-light-theme";

/**
 * App shell: the rail scrolls, and there is one definition of "home".
 *
 * Two failures this pins down, both of which look fine in code review:
 *
 *  - A `sticky` column with no `max-height` and no `overflow` has no scrollbar
 *    of its own, so anything past the fold is simply unreachable. Either half of
 *    the fix alone leaves it broken, which is why both are asserted.
 *  - `/social` and `/dashboard` were both used as "the user's home page" in
 *    different files. The middleware sent a non-admin hitting /admin to
 *    `/social` while the admin page's own guard sent the same person to
 *    `/dashboard` — two answers in one request path.
 *
 * Run: npx tsx --tsconfig tsconfig.script.json scripts/verify-app-shell.ts
 */

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
// Normalised to LF. `core.autocrlf` checks these files out with CRLF on
// Windows, and several checks below match multi-line literals — those
// silently found nothing and reported a token as missing from a theme it
// was in fact declared in.
const read = (p: string) =>
  fs.readFileSync(path.join(root, p), "utf8").split("\r\n").join("\n");
/** Source with comments stripped, so prose can't satisfy a rule. */
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Every user-facing .tsx, for scans that must not miss a component. */
function mainTsx(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith(".tsx")) out.push(rel);
    }
  };
  walk("src/components/user");
  walk("src/components/dashboard");
  return out;
}

function main() {
  console.log("\n=== App shell ===\n");

  /* ── 1. The right rail ── */
  console.log("1. The social rail scrolls on its own");
  {
    const v = code("src/components/user/feed/social-feed-view.tsx");
    const rail =
      v.match(/<aside className="hidden xl:block[^"]*">\s*<div className="([^"]+)"/)?.[1] ?? "";
    check("the rail's sticky container was found", rail.length > 0, rail.slice(0, 60));

    check("it is still sticky", /(^|\s)sticky(\s|$)/.test(rail));
    // Both halves are required. A max-height with no overflow just clips; an
    // overflow with no height bound never triggers.
    check("it has a height bound", /max-h-\[/.test(rail), rail);
    check("it has its own scrollbar", /overflow-y-auto/.test(rail), rail);
    check(
      "the height bound accounts for the anchor ad bar",
      /--anchor-ad-h/.test(rail),
      rail
    );
    // Measured in Chrome: the rail holds ~2600px of widgets in a 666px window,
    // and `scrollbar-thin` renders 4px — which sat inside `pr-1`'s 4px of
    // padding and was invisible on a dark background. The column scrolled fine;
    // there was no way to tell that it could. The default 8px track is the
    // affordance, so neither the thin variant nor the padding that hid it may
    // come back.
    check(
      "the scrollbar is not the near-invisible thin variant",
      !/scrollbar-thin/.test(rail) && !/scrollbar-none/.test(rail),
      rail
    );
    check(
      "there is room for the 8px track beside the cards",
      /(^|\s)pr-2(\s|$)/.test(rail),
      rail
    );
    // A flick at the end of the rail should not carry on into the page behind.
    check("scrolling does not chain to the page", /overscroll-contain/.test(rail));

    // `self-start` on the aside would shrink it to its content, leaving `sticky`
    // nothing to travel inside — the classic silent way to break this.
    const aside = v.match(/<aside className="(hidden xl:block[^"]*)"/)?.[1] ?? "";
    check(
      "the aside is left to stretch, so sticky still has room to travel",
      aside.length > 0 && !/self-start/.test(aside),
      aside
    );

    // The column that was already right must stay right.
    check(
      "the left nav still scrolls independently",
      /flex-1 overflow-y-auto/.test(code("src/components/dashboard/sidebar.tsx"))
    );
  }

  /* ── 2. One home ── */
  console.log("\n2. One definition of home");
  {
    check("USER_HOME is /social", USER_HOME === "/social", USER_HOME);

    // The two places that already agreed, read from source — a change to either
    // without the constant fails here.
    check(
      "the sidebar's Home entry points at it",
      new RegExp(`\\{ name: "Home", href: "${USER_HOME}"`).test(
        code("src/components/dashboard/sidebar.tsx")
      )
    );
    check(
      "the login page falls back to it",
      new RegExp(`callbackUrl"\\) \\|\\| "${USER_HOME}"`).test(
        code("src/app/(auth)/login/page.tsx")
      )
    );
    check(
      "the auth middleware sends a non-admin there",
      new RegExp(`new URL\\("${USER_HOME}", nextUrl\\)`).test(
        code("src/lib/auth/config.ts")
      )
    );

    // The admin sidebar's mobile overlay is mounted unconditionally and shown
    // by class. As a conditional first child it changed the fragment's child
    // count, so any DOM perturbation before hydration shifted every following
    // node and surfaced as a whole-tree hydration mismatch rooted at the
    // sidebar.
    {
      const sb = code("src/components/admin/sidebar.tsx");
      check(
        "the mobile overlay is not conditionally mounted",
        !/\{isMobileOpen && \(/.test(sb),
        "a conditional first child makes the sibling count differ between renders"
      );
      check(
        "…and it cannot swallow clicks while closed",
        /opacity-0 pointer-events-none/.test(sb),
        "an always-mounted full-screen overlay without this blocks every click in the admin"
      );
      check(
        "a closed drawer is hidden from assistive tech",
        (sb.match(/aria-hidden=\{!isMobileOpen\}/g) ?? []).length === 2,
        "it is only moved off-screen, so its links otherwise stay in the tab order"
      );
    }

    // The sites that used to disagree.
    const RETURN_SITES = [
      "src/components/admin/header.tsx",
      "src/components/admin/sidebar.tsx",
      "src/components/tutor/TutorShell.tsx",
      "src/app/admin/layout.tsx",
      "src/app/admin/page.tsx",
      "src/app/(auth)/register/page.tsx",
    ];
    const stale = RETURN_SITES.filter((f) =>
      /href="\/dashboard"|redirect\("\/dashboard"\)|callbackUrl: "\/dashboard"/.test(
        code(f)
      )
    );
    check(
      "no return-to-app site still hardcodes /dashboard",
      stale.length === 0,
      stale.join(", ")
    );
    const notUsingConstant = RETURN_SITES.filter(
      (f) => !/USER_HOME/.test(code(f))
    );
    check(
      "each of them uses the shared constant",
      notUsingConstant.length === 0,
      notUsingConstant.join(", ")
    );

    // The negative that matters. These buttons SAY "Dashboard", so their href
    // and label agree; a blanket rewrite would make them lie.
    const LABELLED_DASHBOARD = [
      "src/app/(main)/error.tsx",
      "src/app/(main)/not-found.tsx",
      "src/app/error.tsx",
      "src/app/not-found.tsx",
      "src/app/(main)/no-access/page.tsx",
      "src/app/(main)/article-tasks/complete/_components/ArticleTaskCompleteClient.tsx",
    ];
    const rewritten = LABELLED_DASHBOARD.filter(
      (f) => !/href="\/dashboard"/.test(code(f))
    );
    check(
      "the links labelled 'Dashboard' still point at /dashboard",
      rewritten.length === 0,
      rewritten.join(", ")
    );
    // And /dashboard is still a real destination, not orphaned.
    check(
      "the Dashboard nav entry still exists",
      /href: "\/dashboard"/.test(code("src/components/dashboard/sidebar.tsx")) &&
        fs.existsSync(path.join(root, "src/app/(main)/dashboard/page.tsx"))
    );
  }

  /* ── 3. One navigation model per width ── */
  console.log("\n3. One navigation model at every width");
  {
    const sb = code("src/components/dashboard/sidebar.tsx");
    const bar = code("src/components/dashboard/bottom-tab-bar.tsx");
    const hdr = code("src/components/dashboard/header.tsx");
    const layout = code("src/app/(main)/layout.tsx");

    // The rail, the drawer, the hamburger and the tab bar must all switch at
    // the SAME breakpoint. When the rail started at `lg` and nothing else did,
    // a 768–1023px tablet got the phone shell — hamburger, drawer and bottom
    // bar — with 250px of dead gutter on either side of the content.
    check(
      "the persistent rail starts at md",
      /md:fixed[^"]*md:flex/.test(sb),
      "the rail must be on screen for tablets, not only laptops"
    );
    check("the phone drawer is md:hidden", /md:hidden/.test(sb) && !/lg:hidden/.test(sb), sb.match(/lg:hidden/)?.[0]);
    check("the bottom tab bar is md:hidden", /md:hidden fixed bottom-0/.test(bar));
    check(
      "the header hamburger hides at the same breakpoint",
      /items-center gap-0\.5 md:hidden/.test(hdr)
    );
    // Nothing else may park at bottom-0 on a phone.
    //
    // The tab bar is z-40 and owns that strip. The social task's submit bar
    // was `fixed bottom-0 z-30`, so on a phone the nav sat on top of it and
    // Submit could not be tapped — the task was impossible to finish on
    // mobile, which is not a layout blemish but a dead end.
    //
    // The house pattern is the anchor ad's: clear the nav (3.5rem, matching
    // the tabs' `min-h-14`) plus the safe area plus `--anchor-ad-h`, and drop
    // the nav's share from `md`, where the nav is hidden.
    {
      const run = read("src/components/user/tasks/social-task-run-view.tsx");
      check(
        "the social submit bar clears the phone nav instead of hiding under it",
        !/fixed bottom-0/.test(run) &&
          /bottom-\[calc\(var\(--bottom-nav-h,3\.5rem\)\+var\(--anchor-ad-h,0px\)\)\]/.test(run),
        "bottom-0 puts it under the z-40 tab bar, where it cannot be tapped"
      );
      check(
        "…and drops the nav's share of that offset from md",
        /md:bottom-\[var\(--anchor-ad-h,0px\)\]/.test(run)
      );
      check(
        "the content below is padded for the bar's new position",
        /pb-\[calc\(7rem\+var\(--bottom-nav-h,3\.5rem\)/.test(run),
        "otherwise the bar simply covers the last card instead of the button"
      );
      // The nav's height is measured, not assumed. A constant was wrong on a
      // real phone — it ignores the safe-area inset, the top border and label
      // reflow — and a few pixels short is enough to bury the Submit button
      // under a z-40 nav.
      check(
        "the nav publishes its measured height",
        /--bottom-nav-h/.test(bar) && /new ResizeObserver\(sync\)/.test(bar),
        "a hard-coded 3.5rem is what clipped the Submit button"
      );
      check(
        "…and gives the space back when it unmounts",
        /setProperty\(NAV_HEIGHT_VAR, "0px"\)/.test(bar)
      );

      // The primary tab is pulled up out of the bar with `-mt-5`, so it floats
      // above it — and `offsetHeight` cannot see a child that overflows
      // upward. Anything clearing the nav by that number still sat under the
      // raised button: on the feed it covered the like row of whichever post
      // landed at the bottom of the screen.
      check(
        "the measurement includes the tab that floats above the bar",
        /getBoundingClientRect\(\)/.test(bar) &&
          /window\.innerHeight - top/.test(bar),
        "offsetHeight misses the raised primary tab by its whole overhang"
      );
      check(
        "…and is redone when the viewport moves",
        /addEventListener\("resize", sync\)/.test(bar) &&
          /orientationchange/.test(bar),
        "a viewport-relative measurement goes stale on rotation and on a toolbar sliding away"
      );

      // Every page under (main) sits above that nav, so the shell reserves the
      // measured height rather than a constant. The old 6rem ignored the
      // device safe area and the raised tab, which is why the last row of a
      // page was cut off.
      const layout = read("src/app/(main)/layout.tsx");
      check(
        "the shell reserves the nav's measured height, not a guess",
        /pb-\[calc\(var\(--bottom-nav-h,6rem\)\+1rem\+var\(--anchor-ad-h,0px\)\)\]/.test(
          layout
        ),
        "a flat 6rem leaves the last thing on the page under the nav"
      );
    }

    /* A single photo does not get to own the screen. */
    {
      const card = read("src/components/user/feed/feed-post-card.tsx");
      check(
        "a lone photo is capped by ratio, not by 70vh",
        /max-h-\[min\(70vh,125vw\)\]/.test(card),
        "a 645x1159 post filled seven tenths of a phone and pushed the like row off"
      );
      check(
        "…and is still shown whole rather than cropped",
        /object-contain/.test(card),
        "cropping somebody's screenshot to tidy the feed is not ours to decide"
      );
      // The header rows are squeezed from both sides; without these a two-word
      // name wrapped mid-name and "2 months ago" broke across two lines.
      check(
        "the author name truncates instead of wrapping",
        /t-card-title truncate/.test(card) && /flex min-w-0 items-center gap-1\.5/.test(card)
      );
      check(
        "the post age stays on one line",
        /shrink-0 whitespace-nowrap/.test(card)
      );

      // The reactions row belongs to the post. A banner above it ran between
      // what somebody wrote and the buttons for reacting to it, splitting the
      // card in two — "under the post" means after the whole post.
      const reactionsAt = card.indexOf("{/* Reactions row.");
      const bannerAt = card.indexOf("placement=\"FEED_POST_BELOW\"");
      check(
        "the sponsor banner sits after the reactions row, not through the post",
        reactionsAt > 0 && bannerAt > reactionsAt,
        "above the row it cuts the post off from its own buttons"
      );
    }

    /* The photo viewer must be escapable. */
    {
      const zoom = read("src/components/user/primitives/image-zoom-modal.tsx");
      // It holds the page still while open, so the two things a reader tries
      // — scrolling, and tapping the picture — both have to lead somewhere.
      // Tapping the photo used to be swallowed by `stopPropagation`, which on
      // a phone means the biggest target on screen did nothing and the app
      // read as frozen.
      check(
        "tapping the photo closes the viewer",
        /<img[\s\S]{0,300}onClick=\{onClose\}/.test(zoom) &&
          !/<img[\s\S]{0,300}onClick=\{\(e\) => e\.stopPropagation\(\)\}/.test(zoom),
        "a photo that swallows the tap is why the app felt stuck"
      );
      check(
        "dragging down dismisses it",
        /onTouchStart=/.test(zoom) &&
          /onTouchEnd=\{endDrag\}/.test(zoom) &&
          /dy > 90/.test(zoom),
        "the gesture already in the reader's fingers when scrolling fails"
      );
      check(
        "…and a cancelled touch does not leave it half-dragged",
        /onTouchCancel=\{endDrag\}/.test(zoom)
      );
      check(
        "the close button clears the notch",
        /env\(safe-area-inset-top\)/.test(zoom)
      );
      // Blanking `overflow` hands scrolling back to a page that something
      // else may still be holding still.
      check(
        "closing restores the page's previous scroll state, not a blank one",
        /const previous = document\.body\.style\.overflow/.test(zoom) &&
          /document\.body\.style\.overflow = previous/.test(zoom)
      );
    }

    /* A white control on an accent surface keeps readable ink. */
    {
      const css = read("src/app/globals.css");
      check(
        "there is a named exception for a control on its own white ground",
        /\.app-on-white \{/.test(css) &&
          /html\[data-theme="light"\] \.app-accent \.app-on-white/.test(css),
        "the family rule paints every themed descendant white, which is invisible on a white pill"
      );
      // The ink is per-control, not one colour for everything the exemption
      // rescues: the rail's Claim button is near-black on white, the balance
      // card's is indigo, the ad's brand monogram is black. Imposing one would
      // have traded an invisible control for a wrong-coloured one.
      check(
        "the exemption lets each control keep its own ink",
        /var\(--app-on-white-ink, var\(--app-grad-a\)\)/.test(css),
        "one hard-coded colour would repaint every control it rescues"
      );

      /* Every control that sits on a SOLID light ground inside an accent or
         on-media surface. The first pass looked for `bg-white` only and missed
         the desktop rail, whose button is `bg-(--app-bright)` — the same
         white, named by a token. That is why the owner still saw a blank pill
         after the "fix". */
      const LIGHT_GROUND = /(bg-white(?![/\w])|bg-\(--app-bright\))/;
      const offenders: string[] = [];
      for (const f of mainTsx()) {
        const src = read(f);
        // Only a file that RENDERS an accent or on-media surface can hold the
        // defect. Without this the scan flagged filter chips in the task
        // lists, which sit on an ordinary card and are correct — and a check
        // that cries wolf is one people learn to skip past.
        if (!/on-media|app-accent/.test(src)) continue;
        const lines = src.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!LIGHT_GROUND.test(line)) continue;
          // A `text-` colour class on the same element is what the family rule
          // catches. `text-white` is already white and wants to be.
          if (!/text-\(--|text-black|text-\[#/.test(line)) continue;
          if (/app-on-white/.test(line)) continue;
          // Inside the surface, not merely in the same file: the ad card's
          // buttons sit below its creative and are unaffected, while the brand
          // monogram a few lines above them is not.
          const near = lines.slice(Math.max(0, i - 6), i).join(" ");
          if (!/on-media|app-accent/.test(near)) continue;
          offenders.push(`${f.split("/").pop()}:${i + 1}`);
        }
      }
      check(
        "no control on a light ground is left to the family rule",
        offenders.length === 0,
        offenders.join(" | ")
      );

      for (const f of [
        "src/components/user/feed/mobile-earn-block.tsx",
        "src/components/user/primitives/balance-card.tsx",
        "src/components/user/feed/feed-right-rail.tsx",
        "src/components/user/feed/feed-ad-card.tsx",
      ]) {
        check(
          `${f.split("/").pop()} carries the exemption`,
          /app-on-white/.test(read(f)),
          "white-on-white: the control renders as a blank shape in light mode"
        );
      }
    }

    // A bar that is `md:hidden` but polls on `max-width: 1023px` runs a 60s
    // fetch loop for every tablet and desktop user to feed a badge they cannot
    // see. The media query and the class have to name the same edge.
    check(
      "the tab bar's poll gate matches the breakpoint it renders at",
      /max-width: 767px/.test(bar),
      bar.match(/max-width: \d+px/)?.[0]
    );

    // Rail width and content offset are two numbers that must agree at BOTH
    // tiers; if either drifts the content sits under the rail or leaves a gap.
    // One width now, not two: the launch design fixes the rail at 260px, which
    // also hands the centre column the 28px the lg tier used to spend on a
    // wider rail. Still two numbers that must agree.
    check(
      "content is offset by the rail width",
      /md:w-\[260px\]/.test(sb) && /md:pl-\[260px\]/.test(layout),
      layout.match(/md:pl-\[\d+px\]/)?.[0]
    );
    check(
      "the page's bottom reserve drops where the tab bar does",
      /md:pb-\[calc\(2rem/.test(layout),
      "otherwise every tablet page keeps 96px of padding for a bar that is not there"
    );

    /* Search. It was an <input> with no handler, no form and no action — it
       looked like search and did nothing, on every page. */
    check(
      "the header search opens the real search surface",
      /GlobalSearch/.test(hdr) && /setIsSearchOpen\(true\)/.test(hdr),
      "a search box that is not wired to /api/search is decoration"
    );
    check(
      "search has an entry point on phones",
      /md:hidden[^"]*"\s*>\s*<Search/.test(hdr) ||
        /aria-label="Search"/.test(hdr),
      "the box was hidden below lg, so phones had no search at all"
    );
    check(
      "the rail can be filtered",
      /aria-label="Filter navigation"/.test(sb),
      "32 destinations need a way to jump, not only a way to scan"
    );

    /* Every destination that was reachable stays reachable. */
    const NAV_MUST_KEEP = [
      "/social", "/dashboard", "/wallet", "/saved", "/leaderboard",
      "/daily-mission", "/missions", "/tasks", "/board-tasks", "/watch-ads",
      "/quizzes", "/games", "/events", "/lottery",
      "/courses", "/my-learning", "/marketplace",
      "/referrals", "/affiliate", "/milestones", "/achievements",
      "/advertiser", "/create-task",
      "/deposit", "/withdrawal", "/transactions", "/packages", "/my-package",
      "/notifications", "/chat", "/support", "/settings",
    ];
    const missing = NAV_MUST_KEEP.filter(
      (h) => !new RegExp(`href: "${h}"`).test(sb)
    );
    check(
      `all ${NAV_MUST_KEEP.length} nav destinations survive the regrouping`,
      missing.length === 0,
      missing.join(", ")
    );

    /* Touch targets. 44px is the floor for anything a thumb hits. */
    // The rail's rows are `app-nav-item` now, which carries min-height 2.75rem
    // in the token layer (asserted in section 7), so counting `min-h-11`
    // literals here would fail on the correct code. What must hold is that
    // every row uses the shared definition and none has drifted back to a
    // hand-typed padding.
    check(
      "nav rows use the 44px shared row definition",
      (sb.match(/app-nav-item/g) ?? []).length >= 3 &&
        !/min-h-11 px-3 py-2 rounded-xl/.test(sb),
      "at py-2 these rows were 36px"
    );
    check("tab bar rows are at least 56px tall", (bar.match(/min-h-14/g) ?? []).length >= 2);
    check(
      "header icon buttons are 44px",
      (hdr.match(/(^|[ "])app-tap/g) ?? []).length >= 4,
      "p-2 around a 24px icon is a 40px target"
    );

    /* Safe areas — the bar and the rail both meet a device edge. */
    check("the tab bar pads for the home indicator", /safe-area-inset-bottom/.test(bar));
    check("…and for landscape notches", /safe-area-inset-left/.test(bar));
    check("the drawer clears the status bar", /safe-area-inset-top/.test(sb));
  }

  /* ── 4. Theme tokens are defined for both themes ── */
  console.log("\n4. Every shell/marketing colour exists in both themes");
  {
    const css = read("src/app/globals.css");
    const block = (sel: string) => {
      const i = css.indexOf(sel);
      if (i < 0) return "";
      const open = css.indexOf("{", i);
      // Token blocks here are flat (no nesting), so the first `}` closes them.
      return css.slice(open, css.indexOf("}", open));
    };
    const varsIn = (s: string) =>
      new Set((s.match(/--(?:shell|mk)-[a-z0-9-]+(?=\s*:)/g) ?? []));

    // The shell tokens live in :root (dark) and are re-declared in the light
    // block. A colour defined in only one of them is a colour that vanishes —
    // or glares — the moment the user flips the switch.
    // `block()` keys off the first `{` after a selector, which a leading
    // comment inside the rule would skip past — so slice this one directly.
    const shellStart = css.indexOf("/* ── App chrome (sidebar");
    const darkShell = varsIn(
      shellStart < 0 ? "" : css.slice(shellStart, css.indexOf("}", shellStart))
    );
    // EVERY `html[data-theme="light"] { … }` block, not one identified by the
    // comment that happens to open it. Anchoring on prose ("/* Text ramp") is
    // how this check silently reported all five shell tokens as missing from
    // light the first time the block was re-commented: the selector had not
    // moved, only the sentence under it.
    const lightShell = new Set<string>();
    {
      const sel = 'html[data-theme="light"]';
      let from = 0;
      for (;;) {
        const at = css.indexOf(sel, from);
        if (at < 0) break;
        from = at + sel.length;
        const open = css.slice(from).match(/^\s*\{/);
        if (!open) continue;
        const start = from + open[0].length;
        for (const v of varsIn(css.slice(start, css.indexOf("}", start))))
          lightShell.add(v);
      }
    }
    const shellOnlyDark = [...darkShell].filter(
      (v) => v.startsWith("--shell") && !lightShell.has(v)
    );
    check(
      "every --shell-* token is declared in both themes",
      darkShell.size > 0 && shellOnlyDark.length === 0,
      shellOnlyDark.join(", ")
    );

    const mkLight = varsIn(block('[data-mk-theme="light"]'));
    const mkDark = varsIn(block('[data-mk-theme="dark"]'));
    const mkMismatch = [
      ...[...mkLight].filter((v) => !mkDark.has(v)).map((v) => `${v} (light only)`),
      ...[...mkDark].filter((v) => !mkLight.has(v)).map((v) => `${v} (dark only)`),
    ];
    check(
      `every --mk-* token is declared in both themes (${mkLight.size})`,
      mkLight.size > 0 && mkMismatch.length === 0,
      mkMismatch.join(", ")
    );

    // A pure-white page behind pure-white cards has no depth at all; that was
    // the landing page's whole problem in light mode.
    const mkBg = block('[data-mk-theme="light"]').match(/--mk-bg:\s*(#[0-9a-f]{6})/i)?.[1] ?? "";
    const mkSurface = block('[data-mk-theme="light"]').match(/--mk-surface:\s*(#[0-9a-f]{6})/i)?.[1] ?? "";
    check(
      "the light marketing page is not the same colour as its cards",
      mkBg.length === 7 && mkBg.toLowerCase() !== mkSurface.toLowerCase(),
      `${mkBg} vs ${mkSurface}`
    );

    check(
      "the shell surface class is layered so utilities still win over it",
      /@layer components \{[\s\S]{0,400}\.app-chrome/.test(css),
      "an unlayered .app-chrome would override any bg-* class put on the header"
    );
  }

  /* ── 5. The public marketing pages and the paths into them ── */
  console.log("\n5. The marketing pages exist and are reachable");
  {
    const PAGES: Array<{ route: string; file: string }> = [
      { route: "/microtask", file: "src/app/(marketing)/microtask/page.tsx" },
      { route: "/advertise", file: "src/app/(marketing)/advertise/page.tsx" },
      { route: "/referral", file: "src/app/(marketing)/referral/page.tsx" },
    ];

    for (const p of PAGES) {
      const exists = fs.existsSync(path.join(root, p.file));
      check(`${p.route} has a page`, exists, p.file);
      if (!exists) continue;
      const src = code(p.file);
      // A page file with no default export renders nothing; Next treats it as
      // an invalid route rather than a blank one, so this is a 500, not an
      // empty page — worth pinning.
      check(`${p.route} exports a page component`, /export default function/.test(src));
      check(
        `${p.route} declares its own metadata`,
        /export function generateMetadata\(\): Metadata/.test(src)
      );
      check(
        `${p.route} sets a canonical URL`,
        new RegExp(`alternates:\\s*\\{\\s*canonical:\\s*"${p.route}"`).test(src)
      );
      check(`${p.route} has an og card`, /openGraph:\s*\{/.test(src));

      // No rate, price or percentage may be written into a marketing page.
      // Every reward and every ad price on this platform is a SystemSetting the
      // owner edits from the admin panel; a figure typed here goes stale
      // silently and is read by the public as a promise.
      const money = src.match(/\$\s?\d|\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s+(?:points|pts|USD|usd)\b/);
      check(
        `${p.route} quotes no hardcoded rate`,
        money === null,
        money ? `found "${money[0]}"` : undefined
      );
    }

    // The counted facts are rendered from the modules that define them, so the
    // page cannot drift from the catalog the way a typed-in number would.
    const micro = code("src/app/(marketing)/microtask/page.tsx");
    check(
      "the micro-task page counts the social catalog instead of stating it",
      /SOCIAL_PLATFORMS\.length/.test(micro) && /p\.actions\.length/.test(micro),
      "a literal platform/action count goes stale on the next catalog edit"
    );
    const adv = code("src/app/(marketing)/advertise/page.tsx");
    check(
      "the advertise page renders the real placement list",
      /AD_PLACEMENTS\.filter/.test(adv) && /SELLABLE\.length/.test(adv)
    );
    check(
      "the advertise page does not sell rewarded video",
      /name !== "REWARDED_VIDEO"/.test(adv),
      "rewarded video ships OFF — it must not appear as buyable inventory"
    );

    /* Nav: two in, one deliberately out. */
    const navHrefs = DEFAULT_LANDING_CONTENT.navbar.nav_links.map((l) => l.href);
    check("MicroTask is in the public menu", navHrefs.includes("/microtask"));
    check("Advertise is in the public menu", navHrefs.includes("/advertise"));
    check(
      "Referral is NOT in the public menu",
      !navHrefs.includes("/referral"),
      "the owner asked for this page to be linked, not listed"
    );

    // A stored navbar replaces the default array wholesale, so the menu entries
    // have to survive an admin who saved the section before they existed.
    const stripped = withRequiredNavLinks({
      ...DEFAULT_LANDING_CONTENT.navbar,
      nav_links: [{ label: "Features", href: "#features" }, { label: "Pricing", href: "#pricing" }],
    });
    const strippedHrefs = stripped.nav_links.map((l) => l.href);
    check(
      "a stored navbar missing them gets them back",
      strippedHrefs.includes("/microtask") && strippedHrefs.includes("/advertise"),
      strippedHrefs.join(" ")
    );
    check(
      "…and they land before Pricing rather than after it",
      strippedHrefs.indexOf("/advertise") < strippedHrefs.indexOf("#pricing"),
      strippedHrefs.join(" ")
    );

    /* Every "Multiple Ways to Earn" card points at a route that exists. */
    const items = withEarnCardLinks(DEFAULT_LANDING_CONTENT.features).items;
    const routeFile = (href: string): string | null => {
      const p = href.split("#")[0].replace(/\/$/, "");
      if (p === "") return "src/app/page.tsx";
      for (const base of ["src/app/(marketing)", "src/app/(main)", "src/app"]) {
        const f = `${base}${p}/page.tsx`;
        if (fs.existsSync(path.join(root, f))) return f;
      }
      return null;
    };
    const dead = items.filter((it) => !it.href || !routeFile(it.href));
    check(
      `every earn card links somewhere real (${items.length})`,
      items.length > 0 && dead.length === 0,
      dead.map((d) => `${d.title} → ${d.href ?? "(none)"}`).join(", ")
    );

    // The three cards the owner named, pointing at the three new pages.
    const hrefFor = (title: string) => items.find((i) => i.title === title)?.href;
    check("the Micro Tasks card opens /microtask", hrefFor("Micro Tasks") === "/microtask");
    check("the Advertiser Slots card opens /advertise", hrefFor("Advertiser Slots") === "/advertise");
    check("the Team & Referrals card opens /referral", hrefFor("Team & Referrals") === "/referral");

    // Three cards point at anchors rather than whole pages; an anchor with no
    // target scrolls nowhere and looks like a broken link.
    const anchors = items
      .map((i) => i.href ?? "")
      .filter((h) => h.includes("#"))
      .map((h) => h.split("#")[1]);
    const missingAnchors = anchors.filter((a) => !micro.includes(`id="${a}"`));
    check(
      `every card anchor exists on its page (${anchors.length})`,
      anchors.length > 0 && missingAnchors.length === 0,
      missingAnchors.join(", ")
    );

    /* Sitemap: all three, including the one that is not in the menu. */
    const sm = code("src/app/sitemap.ts");
    for (const p of PAGES) {
      check(`${p.route} is in the sitemap`, sm.includes(`"${p.route}"`));
    }

    /* Contrast. Computed, not eyeballed — both themes, 4.5:1 for body text. */
    const css = read("src/app/globals.css");
    const tokenIn = (theme: string, name: string) =>
      css
        .slice(css.indexOf(`[data-mk-theme="${theme}"]`))
        .match(new RegExp(`--${name}:\\s*(#[0-9a-f]{3,6})`, "i"))?.[1] ?? "";
    const lum = (hexIn: string) => {
      let h = hexIn.replace("#", "");
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const ch = [0, 2, 4].map((i) => {
        const c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const contrast = (a: string, b: string) => {
      const [la, lb] = [lum(a), lum(b)];
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    for (const theme of ["light", "dark"]) {
      for (const fg of ["mk-text", "mk-muted", "mk-subtle", "mk-accent"]) {
        for (const bg of ["mk-bg", "mk-band", "mk-surface"]) {
          const f = tokenIn(theme, fg);
          const b = tokenIn(theme, bg);
          const r = f && b ? contrast(f, b) : 0;
          check(
            `${theme}: ${fg} on ${bg} clears 4.5:1`,
            r >= 4.5,
            `${f} on ${b} = ${r.toFixed(2)}`
          );
        }
      }
    }
  }

  /* ── 6. The design system: type, rhythm, depth, motion, and the landing
         page's coded fallback ── */
  console.log("\n6. The marketing design system holds together");
  {
    const css = read("src/app/globals.css");

    /* 6a. The CSS-comment incident. A comment containing a Tailwind class pair
       with a star and a slash in it closes itself early, and the rest of the
       line is then parsed as CSS. That broke the build once (c6bf6fa).
       Stripping every comment and checking the braces still balance catches
       the whole class of it. */
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const opens = (stripped.match(/\{/g) ?? []).length;
    const closes = (stripped.match(/\}/g) ?? []).length;
    check(
      "globals.css braces balance once comments are stripped",
      opens === closes,
      `${opens} open vs ${closes} close`
    );

    /* 6b. Token parity across EVERY marketing theme block. The tokens are
       declared in more than one place now, so collect all of them rather than
       only the first block (which is what check 4 does). */
    const allVarsFor = (theme: string) => {
      const out = new Set<string>();
      const re = new RegExp(`\\[data-mk-theme="${theme}"\\]\\s*\\{`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(css))) {
        const body = css.slice(m.index, css.indexOf("}", m.index));
        for (const v of body.match(/--mk-[a-z0-9-]+(?=\s*:)/g) ?? []) out.add(v);
      }
      return out;
    };
    const lightVars = allVarsFor("light");
    const darkVars = allVarsFor("dark");
    const onlyOne = [
      ...[...lightVars].filter((v) => !darkVars.has(v)).map((v) => `${v} (light only)`),
      ...[...darkVars].filter((v) => !lightVars.has(v)).map((v) => `${v} (dark only)`),
    ];
    check(
      `every --mk-* token, in every block, exists in both themes (${lightVars.size})`,
      lightVars.size > 0 && onlyOne.length === 0,
      onlyOne.join(", ")
    );

    /* 6c. Contrast on the tokens added for the product mock and the section
       eyebrows. Computed from the file, not eyeballed. */
    const hexOf = (theme: string, name: string) => {
      const re = new RegExp(`\\[data-mk-theme="${theme}"\\]\\s*\\{`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(css))) {
        const body = css.slice(m.index, css.indexOf("}", m.index));
        const hit = body.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{3,6})`, "i"));
        if (hit) return hit[1];
      }
      return "";
    };
    const lum2 = (hexIn: string) => {
      let h = hexIn.replace("#", "");
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const ch = [0, 2, 4].map((i) => {
        const c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const ratio = (a: string, b: string) => {
      const la = lum2(a);
      const lb = lum2(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    // Each pair is text painted on a fill the page actually puts it on.
    const PAIRS: [string, string][] = [
      ["mk-accent", "mk-accent-soft"],
      ["mk-success", "mk-success-soft"],
      ["mk-success", "mk-surface"],
      ["mk-success", "mk-surface-2"],
      ["mk-success", "mk-bg"],
      ["mk-accent", "mk-surface-2"],
      ["mk-subtle", "mk-surface-2"],
      ["mk-muted", "mk-surface-2"],
    ];
    for (const theme of ["light", "dark"]) {
      for (const [fg, bg] of PAIRS) {
        const f = hexOf(theme, fg);
        const b = hexOf(theme, bg);
        const r = f && b ? ratio(f, b) : 0;
        check(
          `${theme}: ${fg} on ${bg} clears 4.5:1`,
          r >= 4.5,
          `${f || "?"} on ${b || "?"} = ${r.toFixed(2)}`
        );
      }
    }

    /* 6d. The scale exists and is used, rather than being retyped. Six
       sections each had their own copy of the heading markup, in four
       different accent hues — two of which failed contrast on the dark band. */
    for (const util of [
      "mk-section",
      "mk-h1",
      "mk-h2",
      "mk-lead",
      "mk-eyebrow",
      "mk-press",
      "mk-rise",
      "mk-in",
      "mk-panel",
    ]) {
      check(`.${util} is defined`, new RegExp(`\\.${util}\\s*\\{`).test(css));
    }
    const SECTIONS = ["features", "how-it-works", "packages", "testimonials", "faq"];
    for (const f of SECTIONS) {
      const src = code(`src/components/landing/${f}.tsx`);
      check(`${f} uses the shared SectionHeading`, src.includes("<SectionHeading"));
      check(`${f} does not re-type a heading scale`, !/text-3xl sm:text-4xl/.test(src));
      check(
        `${f} does not re-introduce a hand-tinted eyebrow`,
        !/rounded-full bg-[a-z]+-500\/10[^"]*text-[a-z]+-600/.test(src)
      );
    }
    for (const f of [...SECTIONS, "cta", "trust-badges", "earnings-calculator"]) {
      const src = code(`src/components/landing/${f}.tsx`);
      check(
        `${f} uses the shared vertical rhythm`,
        /mk-section(-tight)?[ "]/.test(src),
        "a hand-typed py-* re-opens the four-different-gaps problem"
      );
    }

    /* 6e. Motion is opt-out-able. */
    const reduced = (
      css.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/g) ?? []
    ).join("\n");
    for (const cls of [
      "mk-rise",
      "mk-in",
      "mk-press",
      "mk-ticker",
      "mk-bar",
      "skeleton",
    ]) {
      check(`.${cls} is answered under prefers-reduced-motion`, reduced.includes(cls));
    }

    /* 6f. Tap targets — a real floor on the controls people actually hit. */
    const hero = code("src/components/landing/hero.tsx");
    check(
      "both hero CTAs are at least 56px tall",
      (hero.match(/min-h-14/g) ?? []).length >= 2
    );
    const tabs = code("src/components/dashboard/bottom-tab-bar.tsx");
    check(
      "every bottom tab is at least 56px tall",
      (tabs.match(/min-h-14/g) ?? []).length >= 2
    );
    const empty = code("src/components/user/primitives/empty-state.tsx");
    check(
      "the empty-state action is at least 44px tall in both branches",
      (empty.match(/min-h-11/g) ?? []).length >= 2
    );

    /* 6g. The hero shows the product. A regression here is silent: the page
       still renders, it just goes back to being a wall of claims. */
    check("the hero renders the product mock", hero.includes("<HeroProduct"));
    const mock = code("src/components/landing/hero-product.tsx");
    check(
      "the mock is built from theme tokens, not a pinned screenshot",
      mock.includes("--mk-surface") && !/<img|next\/image/.test(mock)
    );

    /* 6h. No landing section is served ONLY from a stored row.
       getLandingContent() merges SystemSetting rows over the coded defaults
       per section. A section with an empty coded default would render as
       nothing on an install that has never saved it — and every code change to
       it would be invisible on one that has. */
    const sectionKeys = Object.keys(DEFAULT_LANDING_CONTENT) as (keyof typeof DEFAULT_LANDING_CONTENT)[];
    const hollow = sectionKeys.filter((k) => {
      const v = DEFAULT_LANDING_CONTENT[k] as unknown;
      if (!v || typeof v !== "object") return true;
      return Object.keys(v as object).length === 0;
    });
    check(
      `every landing section has a coded fallback (${sectionKeys.length})`,
      hollow.length === 0,
      hollow.join(", ")
    );
    const home = code("src/app/page.tsx");
    const unrendered = sectionKeys.filter(
      (k) => k !== "appearance" && !home.includes(`content.${k}`)
    );
    check(
      "the home page renders every section it has a default for",
      unrendered.length === 0,
      unrendered.join(", ")
    );
  }


  /* ── 7. The app design system ──────────────────────────────────────────
     The marketing surface got a token layer and the app did not, so the
     product was 2,000 ad-hoc utility strings and a per-file colour opinion.
     This section pins down the four ways that regresses, in the order they
     actually happened:

       a) a token declared in one theme only — invisible text the first time
          somebody flips the toggle;
       b) a colour that looks fine to the author and measures 4.2:1;
       c) a tap target derived from padding plus a line-height, or inherited
          from a parent selector that does not reach the child;
       d) the failure mode of the LAST pass: tokens defined, components left
          on the classes they already had, and the whole thing reported as a
          redesign while looking identical.

     (d) is why the checks below name specific strings that were REMOVED.
     A rule that only asserts the new class is present passes happily on a
     file that has both. */
  console.log("\n7. App design system — tokens, scale, contrast, targets");
  {
    const css = read("src/app/globals.css");

    /* ── 7a. Declared in both themes ──────────────────────────────────── */

    /**
     * Every `--name: value;` inside the blocks a selector opens.
     *
     * Written as a scan rather than one regex on purpose. The obvious version
     * anchors the selector to `^` or a preceding `}`, and every block in this
     * file is preceded by a banner comment instead — so it matched almost
     * nothing while reporting every token as "declared in light only". A check
     * that silently finds nothing is worse than no check.
     */
    const declsIn = (selector: string) => {
      const out = new Map<string, string>();
      let from = 0;
      for (;;) {
        const at = css.indexOf(selector, from);
        if (at < 0) break;
        from = at + selector.length;
        // The selector must be a whole token (`:root` must not match
        // `:root:not([data-theme])`) and must open a block immediately.
        const rest = css.slice(from);
        const open = rest.match(/^\s*\{/);
        if (!open) continue;
        const bodyStart = from + open[0].length;
        const end = css.indexOf("}", bodyStart);
        if (end < 0) continue;
        for (const d of css
          .slice(bodyStart, end)
          .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
          out.set(d[1], d[2].trim());
        }
      }
      return out;
    };

    // Tailwind v4 emits `@theme` into `:root`, and the neutral ramp the app
    // tokens point at (`--color-gray-900` and friends) lives there — so for
    // the purpose of resolving a token to a colour the two are one scope.
    const rootDecls = new Map([
      ...declsIn("@theme"),
      ...declsIn(":root"),
    ]);
    const lightDecls = declsIn('html[data-theme="light"]');

    // The load-bearing rule. A token that exists ONLY under a theme selector
    // has no value at all in the other theme: the property falls back to
    // `unset`, which for a colour is transparent or inherited — i.e. text
    // that is simply not there.
    const orphans = [...lightDecls.keys()].filter(
      (k) => (k.startsWith("--app-") || k.startsWith("--shell-")) && !rootDecls.has(k)
    );
    check(
      "no app/shell token is declared only in the light theme",
      orphans.length === 0,
      orphans.join(", ")
    );

    // The colour tokens whose VALUE must differ per theme (a single value
    // cannot clear 4.5:1 on both a near-black and a white card).
    const THEMED = [
      "--app-in",
      "--app-out",
      "--app-warn",
      "--app-info",
      "--app-in-soft",
      "--app-out-soft",
      "--app-warn-soft",
      "--app-info-soft",
      "--app-in-line",
      "--app-out-line",
      "--app-warn-line",
      "--app-info-line",
      "--app-page",
      "--app-surface",
      "--app-surface-2",
      "--app-line",
      "--app-line-strong",
      // The semantic ink layer. These exist so a call site can say "dark, in
      // both themes" — which a ramp step cannot, because the ramp is the thing
      // that flips. A value here in only one theme would be worse than the bug
      // it replaces, so they are asserted per theme like everything else.
      "--app-ink",
      "--app-ink-2",
      "--app-ink-3",
      "--app-glyph",
      "--app-accent-edge",
      "--app-rail-a",
      "--app-rail-b",
      "--app-e1",
      "--app-e2",
      "--app-e3",
    ];
    const missingDark = THEMED.filter((t) => !rootDecls.has(t));
    const missingLight = THEMED.filter((t) => !lightDecls.has(t));
    check(
      `all ${THEMED.length} theme-sensitive tokens are declared in dark`,
      missingDark.length === 0,
      missingDark.join(", ")
    );
    check(
      `all ${THEMED.length} theme-sensitive tokens are declared in light`,
      missingLight.length === 0,
      missingLight.join(", ")
    );

    // The shape / rhythm / motion tokens are theme-independent by design, so
    // they belong in `:root` and nowhere else.
    for (const t of [
      "--app-grad",
      "--app-grad-a",
      "--app-grad-b",
      "--app-r-chip",
      "--app-r-control",
      "--app-r-card",
      "--app-r-panel",
      "--app-gap",
      "--app-pad",
      "--app-pad-lg",
      "--app-ease",
      // Theme-INDEPENDENT on purpose: these three name a ground rather than a
      // theme. A label on a bright fill is near-black whichever theme is on,
      // and a label on the accent gradient is white whichever theme is on.
      "--app-on-bright",
      "--app-on-accent",
      "--app-bright",
      "--app-badge",
    ]) {
      check(`${t} is declared`, rootDecls.has(t));
    }

    /* ── 7b. Contrast, computed ───────────────────────────────────────────
       Not "looks fine": WCAG 2.1 relative luminance, recomputed from the
       values actually in the file on every run, so retuning a token either
       stays inside the floor or fails here. Body text 4.5:1, non-text 3:1,
       and a GRADIENT is measured at its worst end — the end that is closest
       in luminance to whatever sits on it. */
    const srgb = (c: number) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const lum = (hex: string) => {
      const h = hex.replace("#", "");
      const n =
        h.length === 3
          ? h
              .split("")
              .map((x) => x + x)
              .join("")
          : h;
      return (
        0.2126 * srgb(parseInt(n.slice(0, 2), 16)) +
        0.7152 * srgb(parseInt(n.slice(2, 4), 16)) +
        0.0722 * srgb(parseInt(n.slice(4, 6), 16))
      );
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(a), lum(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    /** Flatten `rgba(255,255,255,alpha)` over an opaque backdrop. */
    const over = (fgHex: string, alpha: number, bgHex: string) => {
      const px = (h: string, i: number) =>
        parseInt(h.replace("#", "").slice(i * 2, i * 2 + 2), 16);
      const mix = (i: number) =>
        Math.round(px(fgHex, i) * alpha + px(bgHex, i) * (1 - alpha));
      return (
        "#" +
        [0, 1, 2]
          .map((i) => mix(i).toString(16).padStart(2, "0"))
          .join("")
      );
    };

    /**
     * Tailwind's own ramp, read from the INSTALLED package, for any token that
     * still points into it via `var()`.
     *
     * This used to be five hexes typed from memory — and they were the v3
     * values. Tailwind v4 ships the ramp as `oklch()`, where indigo-600 is
     * #4f39f6, not #4f46e5. So the gradient was being measured against a colour
     * the browser never painted: close enough that the numbers looked right,
     * which is the worst kind of wrong for a contrast check. Reading and
     * converting the real file means the measurement tracks whatever Tailwind
     * version is installed, including an upgrade that reshades the ramp.
     */
    const oklchToHex = (Lp: number, C: number, Hdeg: number) => {
      const h = (Hdeg * Math.PI) / 180;
      const A = C * Math.cos(h);
      const B = C * Math.sin(h);
      const l = (Lp + 0.3963377774 * A + 0.2158037573 * B) ** 3;
      const m = (Lp - 0.1055613458 * A - 0.0638541728 * B) ** 3;
      const s = (Lp - 0.0894841775 * A - 1.291485548 * B) ** 3;
      const enc = (x: number) => {
        const v =
          x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, "0");
      };
      return (
        "#" +
        enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) +
        enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) +
        enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
      );
    };
    const TW: Record<string, string> = {};
    {
      const themeFile = path.join(root, "node_modules/tailwindcss/theme.css");
      const raw = fs.existsSync(themeFile) ? fs.readFileSync(themeFile, "utf8") : "";
      for (const m of raw.matchAll(
        /(--color-[a-z]+-\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g
      )) {
        TW[m[1]] = oklchToHex(Number(m[2]) / 100, Number(m[3]), Number(m[4]));
      }
      check(
        "Tailwind's shipped ramp was read and converted",
        Object.keys(TW).length > 200,
        `${Object.keys(TW).length} colours`
      );
    }
    /** Resolve a token to a hex, following one level of `var()`. */
    const hexOf = (token: string, theme: "dark" | "light"): string => {
      const raw =
        (theme === "light" ? lightDecls.get(token) : undefined) ??
        rootDecls.get(token) ??
        "";
      const direct = raw.match(/#[0-9a-fA-F]{3,8}/)?.[0];
      if (direct) return direct.slice(0, 7);
      const ref = raw.match(/var\((--[\w-]+)\)/)?.[1];
      if (ref && TW[ref]) return TW[ref];
      if (ref) return hexOf(ref, theme);
      return "";
    };

    // The surfaces text actually sits on, per theme.
    const SURF = {
      // The chrome bar is read from the token, not typed here. It used to be
      // the literal "#ffffff", which stopped being true the moment the light
      // theme got a real surface scale and gave the chrome its own plane —
      // and a contrast check measured against a colour the app does not paint
      // is worse than no check.
      dark: {
        card: hexOf("--app-surface", "dark"),
        tile: hexOf("--app-surface-2", "dark"),
        chrome: hexOf("--shell-bg", "dark"),
      },
      light: {
        card: hexOf("--app-surface", "light"),
        tile: hexOf("--app-surface-2", "light"),
        chrome: hexOf("--shell-bg", "light"),
      },
    };
    check(
      "every surface token resolved to a colour",
      Object.values(SURF).every((s) => Object.values(s).every((v) => /^#/.test(v))),
      JSON.stringify(SURF)
    );

    const gradA = hexOf("--app-grad-a", "dark");
    const gradB = hexOf("--app-grad-b", "dark");

    type Row = [string, string, string, string, number];
    const rows: Row[] = [
      // The one gradient, measured at BOTH ends against the white it carries.
      ["dark+light", "white on gradient start", "#ffffff", gradA, 4.5],
      ["dark+light", "white on gradient end", "#ffffff", gradB, 4.5],
      // Labels printed on the gradient at reduced opacity, flattened first.
      // Labels on the gradient are white at 90%, not 75%. At 75% the eyebrow
      // measured 3.89:1 against the violet end and at 70% the caption 3.58:1 —
      // both under the floor, on the balance panel, which is the one surface
      // this whole pass exists to make feel good. 90% is 4.91:1.
      [
        "dark+light",
        "white/90 label on gradient end",
        over("#ffffff", 0.9, gradB),
        gradB,
        4.5,
      ],
      [
        "dark+light",
        "white/90 label on the black/20 tile over the gradient",
        over("#ffffff", 0.9, over("#000000", 0.2, gradB)),
        over("#000000", 0.2, gradB),
        4.5,
      ],
      // The solid-white primary action on the gradient panel (Withdraw, Claim).
      ["dark+light", "gradient end behind a white button", gradB, "#ffffff", 3],
      // Semantic text, both themes, on the card and on the nested tile.
      ...(["dark", "light"] as const).flatMap((th): Row[] => {
        const s = SURF[th];
        return [
          [th, "money in on card", hexOf("--app-in", th), s.card, 4.5],
          [th, "money in on tile", hexOf("--app-in", th), s.tile, 4.5],
          [th, "money out on card", hexOf("--app-out", th), s.card, 4.5],
          [th, "warning on card", hexOf("--app-warn", th), s.card, 4.5],
          [th, "brand text on card", hexOf("--app-info", th), s.card, 4.5],
          // Chips: the label on its own soft fill.
          [th, "in chip on in-soft", hexOf("--app-in", th), hexOf("--app-in-soft", th), 4.5],
          [th, "out chip on out-soft", hexOf("--app-out", th), hexOf("--app-out-soft", th), 4.5],
          [th, "warn chip on warn-soft", hexOf("--app-warn", th), hexOf("--app-warn-soft", th), 4.5],
          [th, "brand chip on info-soft", hexOf("--app-info", th), hexOf("--app-info-soft", th), 4.5],
          // Non-text, 3:1. The active-nav rail and the tab underline carry no
          // text at all, so the fill is the only thing identifying them.
          [th, "nav rail (a) on chrome", hexOf("--app-rail-a", th), s.chrome, 3],
          [th, "nav rail (b) on chrome", hexOf("--app-rail-b", th), s.chrome, 3],
          // The hairline that defines the gradient button's edge — the fill
          // itself is 2.84:1 against the dark bar, which is why it exists.
          [th, "accent edge on chrome", hexOf("--app-accent-edge", th), s.chrome, 3],
        ];
      }),
      // The neutral ramp that carries most of the words on the screen. These
      // were measured in an earlier pass; re-measured here because this layer
      // changed which surface they sit on.
      ["dark", "gray-300 body on card", "#c7ccdb", SURF.dark.card, 4.5],
      ["dark", "gray-400 meta on card", "#99a0b6", SURF.dark.card, 4.5],
      ["dark", "gray-500 eyebrow on card", "#828ba0", SURF.dark.card, 4.5],
      ["dark", "gray-400 meta on tile", "#99a0b6", SURF.dark.tile, 4.5],
      ["light", "gray-300 body on card", "#334155", SURF.light.card, 4.5],
      ["light", "gray-400 meta on card", "#475569", SURF.light.card, 4.5],
      ["light", "gray-500 eyebrow on card", "#5b6675", SURF.light.card, 4.5],
      ["light", "gray-400 meta on tile", "#475569", SURF.light.tile, 4.5],
      // The one decorative hue left in the feed: a loved heart.
      ["dark", "loved heart (rose-400) on card", "#fb7185", SURF.dark.card, 4.5],
      ["light", "loved heart (rose-700) on card", "#be123c", SURF.light.card, 4.5],
    ];

    console.log("\n   theme      ratio  floor  pair");
    const failed: string[] = [];
    for (const [theme, label, fg, bg, floor] of rows) {
      if (!/^#/.test(fg) || !/^#/.test(bg)) {
        failed.push(`${label} — unresolved (${fg || "?"} on ${bg || "?"})`);
        continue;
      }
      const r = ratio(fg, bg);
      console.log(
        `   ${theme.padEnd(10)} ${r.toFixed(2).padStart(5)}  ${String(floor).padStart(4)}   ` +
          `${label} (${fg} on ${bg})`
      );
      if (r < floor) failed.push(`${theme} ${label}: ${r.toFixed(2)} < ${floor}`);
    }
    check(
      `all ${rows.length} measured pairs clear their floor`,
      failed.length === 0,
      failed.join("; ")
    );

    // A gradient painted into TEXT is a different measurement from a gradient
    // painted behind it, and the brand ramp fails the text one badly (2.96:1
    // on the dark card). The balance figure is white ON the gradient for
    // exactly this reason, and nothing in the app may clip it into glyphs.
    for (const f of [
      "src/components/user/primitives/balance-card.tsx",
      "src/components/dashboard/sidebar.tsx",
      "src/components/user/feed/feed-right-rail.tsx",
    ]) {
      check(
        `${f.split("/").pop()} does not clip a gradient into text`,
        !/bg-clip-text/.test(code(f))
      );
    }

    /* ── 7c. The scale is DECLARED and USED ───────────────────────────── */
    for (const cls of [
      "t-hero",
      "t-figure",
      "t-figure-sm",
      "t-title",
      "t-section",
      "t-card-title",
      "t-body",
      "t-meta",
      "t-eyebrow",
      "app-card",
      "app-panel",
      "app-tile",
      "app-accent",
      "app-accent-soft",
      "app-chip",
      "app-icon",
      "app-nav-item",
      "app-tap",
      "app-press",
      "app-lift",
    ]) {
      check(`.${cls} is defined`, new RegExp(`\\.${cls}\\s*[,{]`).test(css));
    }

    // Defined is not the same as used, and a token layer nobody calls is the
    // exact shape of the last pass: a diff full of new CSS and a product that
    // looks identical. Every class the layer defines must appear in at least
    // one component, or it is scaffolding pretending to be a design system.
    {
      const walk = (dir: string): string[] => {
        const full = path.join(root, dir);
        if (!fs.existsSync(full)) return [];
        return fs.readdirSync(full, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory()
            ? walk(path.join(dir, e.name))
            : /\.tsx?$/.test(e.name)
              ? [read(path.join(dir, e.name))]
              : []
        );
      };
      const src = [...walk("src/components"), ...walk("src/app")].join("\n");
      const unused = [
        "t-hero",
        "t-figure",
        "t-figure-sm",
        "t-title",
        "t-section",
        "t-card-title",
        "t-body",
        "t-meta",
        "t-eyebrow",
        "t-in",
        "t-out",
        "t-warn",
        "app-card",
        "app-panel",
        "app-tile",
        "app-accent",
        "app-accent-soft",
        "app-accent-glow",
        "app-chip",
        "app-chip-in",
        "app-chip-out",
        "app-chip-warn",
        "app-chip-info",
        "app-icon",
        "app-icon-accent",
        "app-icon-lg",
        "app-nav-item",
        "app-tap",
        "app-tap-row",
        "app-press",
        "app-lift",
        "app-sheet",
        "app-tick",
      ].filter((c) => !new RegExp(`[" ]${c}[" ]`).test(src));
      check(
        "every class the token layer defines is used by a component",
        unused.length === 0,
        unused.join(", ")
      );
    }

    // The balance figure must be the biggest thing on its card by a wide
    // margin — that is the whole brief for the money surfaces. `t-hero` tops
    // out at 3rem against an 0.6875rem eyebrow: a 4.4x ratio.
    const hero = css.match(/\.t-hero\s*\{[^}]*font-size:\s*clamp\([^)]*,\s*([\d.]+)rem\)/);
    const eyebrow = css.match(/\.t-eyebrow\s*\{[^}]*font-size:\s*([\d.]+)rem/);
    check(
      "t-hero is at least 4x the eyebrow at full size",
      !!hero && !!eyebrow && Number(hero[1]) / Number(eyebrow[1]) >= 4,
      hero && eyebrow ? `${hero[1]}rem vs ${eyebrow[1]}rem` : "not found"
    );

    // USED, not merely defined. This is the check that would have failed on
    // the previous pass: each of these files must reference the scale.
    const SCALE = /\b(t-hero|t-figure|t-figure-sm|t-title|t-section|t-card-title|t-body|t-meta|t-eyebrow|app-card|app-tile|app-accent|app-icon|app-chip|app-nav-item|app-tap|app-press)\b/;
    for (const f of [
      "src/components/dashboard/header.tsx",
      "src/components/dashboard/sidebar.tsx",
      "src/components/dashboard/bottom-tab-bar.tsx",
      "src/components/user/feed/feed-post-card.tsx",
      "src/components/user/feed/feed-quick-links.tsx",
      "src/components/user/feed/create-post-composer.tsx",
      "src/components/user/feed/feed-right-rail.tsx",
      "src/components/user/feed/mobile-earn-block.tsx",
      "src/components/user/feed/social-feed-view.tsx",
      "src/components/user/primitives/balance-card.tsx",
      "src/components/user/primitives/stat-card.tsx",
      "src/components/user/primitives/task-card.tsx",
      "src/components/user/primitives/transaction-row.tsx",
      "src/components/user/primitives/skeleton.tsx",
      "src/components/user/tasks/tasks-hub-view.tsx",
      "src/components/user/wallet/wallet-view.tsx",
      "src/components/user/feed/active-events-card.tsx",
      "src/components/user/feed/reaction-button.tsx",
      // `(main)/layout.tsx` is deliberately not in this list: it consumes the
      // rhythm token rather than a class, and has its own check below.
      "src/app/(main)/dashboard/page.tsx",
    ]) {
      check(`${f.split("/").pop()} uses the app scale`, SCALE.test(code(f)));
    }

    // The page gutter is the same fluid step the cards space themselves by,
    // rather than a hand-typed px-4 that put a card's content 16px from the
    // screen edge with its own padding immediately inside it.
    check(
      "the app's page gutter comes from the rhythm token",
      /px-\(--app-pad\)/.test(code("src/app/(main)/layout.tsx"))
    );

    /* ── 7d. The rainbow does not come back ───────────────────────────────
       Named strings that were REMOVED. Asserting only that the new class is
       present passes on a file that kept both, which is how a pass ends up
       being a class rename. */
    const gone: [string, RegExp, string][] = [
      [
        "src/components/user/feed/feed-quick-links.tsx",
        /text-(amber|emerald|sky|violet|rose|indigo)-400/,
        "six shortcuts in six hues — the row the owner screenshotted",
      ],
      [
        "src/components/user/tasks/tasks-hub-view.tsx",
        /CARD_COLOR|bg-(red|blue|purple|pink|cyan)-500\/10/,
        "twelve category cards in nine hues",
      ],
      [
        "src/components/dashboard/sidebar.tsx",
        /TONE\[|bg-(emerald|red)-500\/12|bg-clip-text/,
        "a hue per mode section, plus a gradient wordmark that read 2.4:1 in light mode",
      ],
      [
        "src/app/(main)/dashboard/page.tsx",
        /ring-1 ring-(indigo|emerald|amber|pink|sky)-500\/20|text-(cyan|fuchsia|violet)-400/,
        "ten shortcuts in nine hues under a tinted balance card",
      ],
      [
        "src/components/user/primitives/stat-card.tsx",
        /text-(indigo|violet|amber|emerald|pink)-400/,
        "a hue per tile in every stat row in the product",
      ],
      [
        "src/components/user/feed/feed-post-card.tsx",
        /border-cyan-500\/40|border-amber-500\/40|bg-indigo-500 hover:bg-indigo-600/,
        "a coloured card border per post state, and a solid indigo Follow x20",
      ],
      [
        "src/components/user/feed/mobile-earn-block.tsx",
        /bg-orange-500|text-amber-400|text-emerald-400|COLOR_CLASSES/,
        "an amber coin, an emerald figure and an orange streak around one balance",
      ],
      [
        "src/components/user/feed/feed-right-rail.tsx",
        /bg-orange-500|text-amber-400\/90|COLOR_CLASSES/,
        "the same four colours again, in the desktop copy of that card",
      ],
      [
        "src/components/user/primitives/transaction-row.tsx",
        /text-red-400|text-emerald-400|meta\.tone/,
        "a hue per transaction source, twelve rows deep",
      ],
      [
        "src/components/user/feed/create-post-composer.tsx",
        /tone: "text-(emerald|amber|pink)-400"|border-indigo-500\/30/,
        "three coloured quick-action icons inside a tinted composer panel",
      ],
      [
        "src/components/user/feed/active-events-card.tsx",
        /text-violet-(300|400)|bg-violet-500|from-violet-500|text-amber-400|text-emerald-400/,
        "violet chrome, an amber reward, a fuchsia bar and an emerald tick in one card",
      ],
      [
        "src/components/user/feed/donation-block.tsx",
        /bg-pink-500\/10|text-pink-400/,
        "a pink button inside a post, under a neutral card",
      ],
      [
        "src/components/admin/settings/feed-widgets-form.tsx",
        /COLOR_CLASSES\[tile\.color\]/,
        "an admin preview tinted by a colour the app does not render",
      ],
    ];
    for (const [f, re, why] of gone) {
      check(`${f.split("/").pop()}: ${why} is gone`, !re.test(code(f)));
    }

    // The one gradient. Nothing outside the token layer may hand-roll one on
    // these surfaces — that is what "concentrated" means in practice.
    for (const f of [
      "src/components/user/primitives/balance-card.tsx",
      "src/components/user/feed/mobile-earn-block.tsx",
      "src/components/dashboard/bottom-tab-bar.tsx",
      "src/components/user/tasks/tasks-hub-view.tsx",
      "src/components/dashboard/sidebar.tsx",
      "src/components/dashboard/header.tsx",
    ]) {
      check(
        `${f.split("/").pop()} paints no ad-hoc gradient`,
        !/bg-linear-to|bg-gradient-to/.test(code(f))
      );
    }
    // The rail is the exception and has to be checked differently: the promo
    // card and the custom widgets take a from/to pair from the ADMIN, which is
    // campaign data, not a design decision. What must hold is that every
    // gradient there is data-driven and the fallback is the app's own.
    {
      const rail = code("src/components/user/feed/feed-right-rail.tsx");
      const grads = rail.match(/bg-linear-to[a-z-]*/g) ?? [];
      const guarded = rail.match(/\?\s*"bg-linear-to-br"\s*:\s*"app-accent"/g) ?? [];
      check(
        "every gradient in the rail is admin data, falling back to app-accent",
        grads.length > 0 && grads.length === guarded.length,
        `${grads.length} gradients, ${guarded.length} guarded`
      );
    }

    /* ── 7e. Tap targets ──────────────────────────────────────────────────
       Written ON the control. `[&>button]` styles DIRECT children only, and
       a like button once ended up a 20px target because it rendered its own
       wrapper and inherited none of the row's padding. */
    check(
      "the post action row no longer sizes its targets with a child selector",
      !/\[&>button\]/.test(code("src/components/user/feed/feed-post-card.tsx"))
    );
    const TAP = /\b(app-tap|app-tap-row|min-h-11|min-h-14)\b/g;
    for (const [f, min] of [
      ["src/components/user/feed/feed-post-card.tsx", 6],
      ["src/components/dashboard/header.tsx", 6],
      ["src/components/dashboard/sidebar.tsx", 2],
      ["src/components/user/feed/feed-quick-links.tsx", 1],
      ["src/components/user/primitives/task-card.tsx", 1],
      ["src/components/user/feed/reaction-button.tsx", 1],
    ] as const) {
      const n = (code(f).match(TAP) ?? []).length;
      check(
        `${f.split("/").pop()} declares ≥${min} explicit tap targets`,
        n >= min,
        `found ${n}`
      );
    }
    // The floors themselves, in the token layer.
    check(
      ".app-tap is 44px in both axes",
      /\.app-tap\s*\{[^}]*min-height:\s*2\.75rem[^}]*min-width:\s*2\.75rem/.test(css)
    );
    check(
      ".app-nav-item is 44px tall",
      /\.app-nav-item\s*\{[^}]*min-height:\s*2\.75rem/.test(css)
    );
    check(
      ".app-tap carries touch-action so the first tap is not delayed 300ms",
      /\.app-tap\s*\{[^}]*touch-action:\s*manipulation/.test(css)
    );

    /* ── 7f. Motion answers prefers-reduced-motion ────────────────────── */
    const reducedBlocks = (
      css.match(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\n\}/g) ?? []
    ).join("\n");
    for (const cls of ["app-press", "app-lift", "app-sheet", "app-tick"]) {
      check(
        `.${cls} is answered under prefers-reduced-motion`,
        reducedBlocks.includes(cls)
      );
    }
    // A hover lift on a touch device leaves the card stuck in its hover state
    // after a tap, because there is no pointer to move away.
    check(
      ".app-lift is behind a hover/fine-pointer query",
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.app-lift/.test(css)
    );

    /* ── 7f-bis. White stays white where the ground is dark ───────────────
       `html[data-theme="light"] .text-white { color: #0f172a !important }` is
       right for a neutral surface and wrong for one that is dark in BOTH
       themes. In light mode it was painting the balance figure, every ad
       headline over a creative and every brand chip near-black on a dark
       ground — the owner's "black text inside the blue".
       Asserted on the surfaces, not on a list of components, because the next
       dark panel someone adds has to inherit this rather than repeat it. */
    const themeCss = read("src/app/globals.css");
    check(
      "white text on the accent gradient is not inverted in light mode",
      /html\[data-theme="light"\][\s\S]{0,400}\.app-accent \.text-white/.test(themeCss) &&
        /color: #ffffff !important/.test(themeCss),
      "the generic .text-white override turns a gradient card's own text near-black"
    );
    check(
      "…and the same holds over a creative or a scrim",
      /html\[data-theme="light"\][\s\S]{0,400}\.on-media/.test(themeCss)
    );
    // Reached by what an element DOES, not by a class it opted into: there are
    // ~240 gradient surfaces and a hand-kept list of them goes stale. The banner
    // carousel is why — its headline rendered black on a blue gradient.
    check(
      "white text on ANY gradient stays white in light mode",
      /\[class\*="bg-linear-to"\]\s*\.text-white/.test(themeCss) &&
        /\[class\*="bg-gradient-to"\]\s*\.text-white/.test(themeCss),
      "a per-component list of gradients is a list that goes out of date"
    );
    check(
      "…and the banner carousel says outright that its slide is a media surface",
      /on-media absolute inset-0/.test(
        read("src/components/user/primitives/banner-slider.tsx")
      )
    );
    check(
      "the media well is dark in BOTH themes",
      (themeCss.match(/--app-media-well:/g) ?? []).length === 2,
      "a pale well in light mode would put the white overlay text on near-white"
    );
    for (const f of [
      "src/components/user/feed/feed-ad-card.tsx",
      "src/components/user/primitives/ad-renderer.tsx",
    ]) {
      const src = read(f);
      check(
        `${f.split("/").pop()} marks its creative well as on-media`,
        src.includes("on-media") && !src.includes('overflow-hidden bg-black"'),
        "bg-black made a letterboxed ad a black slab across the card"
      );
    }

    /* ── 7f-ter. A grid column has to be allowed to shrink ────────────────
       A `1fr` track is `minmax(auto, 1fr)`, so it refuses to go below its
       widest child. Anything inside that is wider than a phone grows the
       column instead of wrapping, and the hero's own `overflow-hidden` then
       cuts the overflow off — which is what "the hero is shifted right and
       cut" was. Same class of bug as a flex child without `min-w-0`, which
       needed fixing in 76 places elsewhere. */
    {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
          const rel = `${dir}/${e.name}`;
          if (e.isDirectory()) walk(rel);
          else if (e.name.endsWith(".tsx")) files.push(rel);
        }
      };
      walk("src/components/landing");
      walk("src/app/(marketing)");
      const unshrinkable: string[] = [];
      for (const f of files) {
        for (const m of read(f).matchAll(/grid-cols-\[[^\]]*fr[^\]]*\]/g)) {
          if (!m[0].includes("minmax(0")) unshrinkable.push(`${f} ${m[0]}`);
        }
      }
      check(
        "every fr grid track on the marketing surface can shrink",
        unshrinkable.length === 0,
        unshrinkable.join(", ")
      );
    }

    /* ── 7g. Nothing became unreachable ───────────────────────────────────
       Two header controls moved into the account menu. Moved is fine; gone
       is not, and the difference is one `git grep` nobody runs. */
    const header = code("src/components/dashboard/header.tsx");
    // It moved into the account menu to thin out a seven-control header, and
    // then back into the row: the owner went looking for it where his hand
    // already goes and could not find it. Assert it is in the shell and that
    // there is exactly ONE of it — two controls doing the same thing is the
    // failure this replaced, not a belt-and-braces win.
    check(
      "the theme toggle is in the shell, exactly once",
      (header.match(/<ThemeSwitch/g) ?? []).length === 1
    );
    check(
      "Reports is still reachable from the account menu",
      /Reports &amp; Transactions|Reports & Transactions/.test(header)
    );
    check(
      "the theme toggle supports the labelled menu-row form",
      /withLabel/.test(code("src/components/dashboard/theme-switch.tsx"))
    );
    check(
      "the balance still links to the wallet from the header",
      /href="\/wallet"/.test(header)
    );

    /* ── 7h. Every accent, not just the default ───────────────────────────
       This is the assertion the whole accent bug reduces to: nobody had ever
       measured any accent but the one that ships. The picker offers 19, each
       remaps the brand ramp, and the gradient, the nav rail and the button
       edge are all drawn off it — so `yellow` and `gold` put white text on a
       bright fill at roughly 2.9:1, on the balance panel, silently.

       Every row of ACCENT_SURFACE is re-measured here on every run, both
       gradient ends against white and all three chrome marks against the bar
       they sit on IN EACH THEME. A new accent added to the picker without a
       measured row fails at the first check below rather than shipping. */
    {
      const DARK_BAR = "#15171f";
      const LIGHT_BAR = "#ffffff";

      // The picker's list is the authority on what can be chosen; the table is
      // the authority on what those choices look like. If they disagree, some
      // accent renders with no surface at all.
      const provider = read("src/components/providers/theme-provider.tsx");
      const listed = (
        provider.match(/export const ACCENTS: Accent\[\] = \[([\s\S]*?)\];/)?.[1] ?? ""
      )
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
      const tabled = Object.keys(ACCENT_SURFACE);
      check("the accent list was found in the theme provider", listed.length > 0);
      check(
        `every offered accent has a measured surface (${listed.length})`,
        listed.length === tabled.length && listed.every((a) => tabled.includes(a)),
        `picker: ${listed.filter((a) => !tabled.includes(a)).join(", ") || "-"}; ` +
          `table only: ${tabled.filter((a) => !listed.includes(a)).join(", ") || "-"}`
      );
      check(
        `the default accent "${DEFAULT_ACCENT}" is one of them`,
        tabled.includes(DEFAULT_ACCENT)
      );

      console.log(
        "\n   accent    grad-a  white  grad-b  white | dark rail-a/b + edge | light rail-a/b + edge"
      );
      const bad: string[] = [];
      for (const [name, a] of Object.entries(ACCENT_SURFACE)) {
        // Both ends, because a gradient is only as legible as its lightest end.
        const wa = ratio("#ffffff", a.gradA);
        const wb = ratio("#ffffff", a.gradB);
        // The edge uses the same value as rail-a, so measuring rail-a measures
        // both; they are listed separately in the table for clarity.
        const da = ratio(a.railADark, DARK_BAR);
        const db = ratio(a.railBDark, DARK_BAR);
        const la = ratio(a.railALight, LIGHT_BAR);
        const lb = ratio(a.railBLight, LIGHT_BAR);
        console.log(
          `   ${name.padEnd(9)} ${a.gradA} ${wa.toFixed(2)}   ${a.gradB} ${wb.toFixed(2)}  | ` +
            `${a.railADark} ${da.toFixed(2)} ${a.railBDark} ${db.toFixed(2)} | ` +
            `${a.railALight} ${la.toFixed(2)} ${a.railBLight} ${lb.toFixed(2)}`
        );
        if (wa < 4.5) bad.push(`${name} grad-a white ${wa.toFixed(2)}`);
        if (wb < 4.5) bad.push(`${name} grad-b white ${wb.toFixed(2)}`);
        if (da < 3) bad.push(`${name} rail-a/edge on dark bar ${da.toFixed(2)}`);
        if (db < 3) bad.push(`${name} rail-b on dark bar ${db.toFixed(2)}`);
        if (la < 3) bad.push(`${name} rail-a/edge on white bar ${la.toFixed(2)}`);
        if (lb < 3) bad.push(`${name} rail-b on white bar ${lb.toFixed(2)}`);
        // A gradient whose ends are far apart in luminance stops reading as one
        // colour — silver's companion hue landed 2x away before the table
        // fell back to silver's own ramp.
        const spread = ratio(a.gradA, a.gradB);
        if (spread > 1.8) bad.push(`${name} gradient ends ${spread.toFixed(2)}x apart`);
      }
      check(
        `all ${Object.keys(ACCENT_SURFACE).length} accents clear 4.5:1 for white ` +
          `and 3:1 for the chrome marks in BOTH themes`,
        bad.length === 0,
        bad.join("; ")
      );

      // The stylesheet is a projection of the table, not a second copy of it.
      const generated = accentSurfaceCss();
      check(
        "globals.css contains the generated accent block, unedited",
        css.includes(generated),
        "re-run this script and paste the block it prints over the generated section"
      );

      // The default (no `data-accent` attribute at all) has to be the same
      // surface as explicitly choosing the default accent, or a user who never
      // opens the picker gets colours nobody measured.
      const dflt = ACCENT_SURFACE[DEFAULT_ACCENT];
      const base = [
        ["--app-grad-a", dflt.gradA, "dark"],
        ["--app-grad-b", dflt.gradB, "dark"],
        ["--app-accent-edge", dflt.railADark, "dark"],
        ["--app-rail-a", dflt.railADark, "dark"],
        ["--app-rail-b", dflt.railBDark, "dark"],
        ["--app-accent-edge", dflt.railALight, "light"],
        ["--app-rail-a", dflt.railALight, "light"],
        ["--app-rail-b", dflt.railBLight, "light"],
      ] as const;
      const wrong = base.filter(
        ([token, want, theme]) =>
          (theme === "light" ? lightDecls : rootDecls).get(token) !== want
      );
      /* Nobody may hard-code an accent outside the table.
         The pre-paint script stamped `data-accent="indigo"` on every visitor —
         including one who had never opened the picker — so the per-accent rule
         always won and the :root default was unreachable. Changing
         DEFAULT_ACCENT did nothing at all on screen, which is exactly how it
         was reported: "everything looks the same". */
      {
        const boot = read("src/app/layout.tsx");
        check(
          "the pre-paint script only sets data-accent when the user chose one",
          /getItem\('earngpt-accent'\);if\(a\)\{/.test(boot) &&
            !/earngpt-accent'\)\|\|'/.test(boot),
          "a literal fallback here overrides the default for everyone, forever"
        );
        const provider = read("src/components/providers/theme-provider.tsx");
        check(
          "the provider's fallback comes from the table",
          /useState<Accent>\(DEFAULT_ACCENT as Accent\)/.test(provider),
          "a second copy of the default is how the two drift apart"
        );

        /* Choosing a colour must not be a one-way door.
           The picker could set a preference and nothing could clear one, so a
           user who had ever tapped a swatch could never see the platform's own
           colour again — or see it change when the platform's did. */
        check(
          "an accent can be cleared back to the platform's",
          /localStorage\.removeItem\(ACCENT_KEY\)/.test(provider) &&
            /removeAttribute\("data-accent"\)/.test(provider),
          "clearing the attribute is not a state change the effect can express"
        );
        for (const f of [
          "src/components/user/settings/settings-view.tsx",
          "src/components/user/profile/profile-edit-tabs.tsx",
        ]) {
          const picker = read(f);
          check(
            `${f.split("/").pop()} offers Default beside the swatches`,
            /applyAccent\(null\)/.test(picker) && /accentIsDefault/.test(picker),
            "the two pickers must offer the same choices"
          );
        }
        // And the server has to accept it, or the column hands the old colour
        // back on the next sign-in.
        const api = read("src/app/api/profile/route.ts");
        check(
          "the profile API accepts a cleared accent",
          /body\.themeAccent !== null && !validAccents\.includes/.test(api) &&
            !/themeAccent: u\.themeAccent \?\? "indigo"/.test(api)
        );
      }

      check(
        "the no-accent default matches the default accent's row exactly",
        wrong.length === 0,
        wrong.map(([t, w, th]) => `${th} ${t} should be ${w}`).join(", ")
      );

      // Literal hexes, not `var()`. Tailwind v4 ships the ramp as oklch and the
      // accent blocks overwrite three of its steps, so a token that points at
      // the ramp is measured against one value and painted with another — which
      // is exactly how indigo-600 was measured at #4f46e5 (v3) while the browser
      // painted #4f39f6 (v4).
      const indirect = [
        "--app-grad-a",
        "--app-grad-b",
        "--app-accent-edge",
        "--app-rail-a",
        "--app-rail-b",
      ].filter((t) =>
        [rootDecls.get(t), lightDecls.get(t)].some((v) => v && v.includes("var("))
      );
      check(
        "the gradient and chrome-mark tokens are literal hexes, not ramp refs",
        indirect.length === 0,
        indirect.join(", ")
      );
    }

    /* -- 7i. No setting renders nothing -------------------------------------
       The Quick Earn tiles used to take a per-tile colour from the admin. The
       feed and the rail render them neutral now, so that control changes
       nothing a user can see. This codebase has shipped a silently dead
       setting twice before -- an admin sets it, nothing happens, and the
       platform reads as broken rather than as configured -- so the control has
       to SAY so. The stored value is kept either way. */
    {
      const form = read("src/components/admin/settings/feed-widgets-form.tsx");
      check(
        "the Quick Earn colour picker is disabled rather than silently dead",
        /value=\{tile\.color\}[\s\S]{0,200}?disabled/.test(form) &&
          !/value=\{tile\.color\}[\s\S]{0,120}?onChange/.test(form),
        "a control that writes a value the app never reads is worse than no control"
      );
      check(
        "...and it says why, on screen, next to itself",
        /Colour is no longer used/.test(form)
      );
      check(
        "the stored value is still shown by name, not thrown away",
        /COLOR_OPTIONS\.map/.test(form)
      );
      check(
        "the reason is recorded where the map is defined",
        /NO LONGER RENDERED/.test(read("src/lib/feed-quick-earn.ts"))
      );
    }
  }

  /* ── 8. Light mode is a THEME, not an inversion shim ────────────────────
     The light theme is produced by flipping the neutral ramp upside down
     (`--color-gray-50` becomes dark ink, `--color-gray-950` becomes a light
     surface), which means any `bg-X text-Y` pair a developer picks while
     looking at the dark screen can invert into nonsense. `bg-white
     text-gray-950` reads as "white button, near-black label" and resolves in
     light to near-white on white.

     None of that is visible in code review — the class names still say the
     right thing — so it is checked by computing it. scripts/verify-light-theme.ts
     rebuilds the real cascade (Tailwind's shipped oklch ramp, the `@theme`
     retune, the light variable flip, the per-class patches and the hue-family
     rules, in that order), resolves every pairing the app actually writes, and
     measures it. The assertions below are its conclusions; run that script
     directly for the full table and the file list behind any failure. */
  console.log("\n8. Light theme — inversion hazards, measured");
  {
    const audit = auditLightTheme();

    check(
      `${audit.pairings.length} bg/text pairings resolved and measured in both themes`,
      audit.measured > 500,
      `${audit.measured} measurements`
    );

    const byKind = (k: Finding["kind"]) =>
      audit.live.filter((f) => f.kind === k);

    // The two failure modes the inversion creates, and the only two that are
    // unarguable: text you cannot see at all, and a surface painted with ink.
    for (const [kind, label] of [
      ["collapse", "no pairing collapses (same-on-same, under 2:1)"],
      ["inverted-text", "no ramp step is used as ink on the wrong side of the flip"],
      ["inverted-bg", "no ink colour is used as a surface"],
    ] as const) {
      const rows = byKind(kind);
      check(
        label,
        rows.length === 0,
        rows
          .slice(0, 5)
          .map((f) => `${f.theme} ${f.label} ${f.ratio.toFixed(2)}:1 (${f.files[0]})`)
          .join("; ")
      );
    }

    const under = byKind("contrast");
    check(
      "every remaining pairing clears 4.5:1 for body text in BOTH themes",
      under.length === 0,
      under
        .slice(0, 5)
        .map((f) => `${f.theme} ${f.label} ${f.ratio.toFixed(2)}:1`)
        .join("; ")
    );
    check("no hard failures at all", audit.hardFailures === 0, String(audit.hardFailures));

    /* The light block may not restate what the ramp flip already does. Two
       copies of one colour is how `.text-gray-600` ended up painting #616b7d
       while `--color-gray-600` said #7a8598 — one class, two colours,
       depending on which rule an element happened to match. */
    const dup = redundantOverrides(audit.cascade);
    check(
      "no per-class light override merely restates the ramp flip",
      dup.length === 0,
      dup.map((d) => `.${d.cls} duplicates ${d.viaVar}`).join(", ")
    );
    const clash = conflictingOverrides(audit.cascade);
    check(
      "no neutral class has two different light values",
      clash.length === 0,
      clash.map((k) => `.${k.cls}: ${k.patch} vs ${k.varName} ${k.viaVar}`).join(", ")
    );

    /* ── The light surface scale is a SCALE ──────────────────────────────
       The complaint that started this was that light mode "doesn't look
       good", and the mechanical reason was that the page, the cards and the
       chrome were 94.0 / 100.0 / 100.0 in L* — the chrome and the cards were
       the identical white, so the sidebar, the feed and the rail merged into
       one flat field and a drop shadow was the only thing suggesting depth.
       Four planes, each a real step from the next, in both directions. */
    const { planes } = paletteTable(audit.cascade);
    for (const theme of ["dark", "light"] as const) {
      const ordered = planes(theme)
        .filter(([n]) => n !== "line")
        .sort((a, b) => lstar(a[1]) - lstar(b[1]));
      const steps = ordered
        .slice(1)
        .map(([, rgb], i) => lstar(rgb) - lstar(ordered[i][1]));
      check(
        `${theme}: the four planes are four distinct surfaces (min step ≥ 2 L*)`,
        steps.every((s) => s >= 2),
        ordered
          .map(([n, rgb]) => `${n} ${toHex(rgb)} L*${lstar(rgb).toFixed(1)}`)
          .join(" < ")
      );
      check(
        `${theme}: chrome and card are not the same colour`,
        toHex(planes(theme).find(([n]) => n === "chrome")![1]) !==
          toHex(planes(theme).find(([n]) => n === "card")![1])
      );
    }

    /* ── Every ink on every plane, both themes ───────────────────────────
       The whole table, recomputed. A glyph is non-text and answers to 3:1;
       everything else is body text at 4.5:1. */
    const { inks } = paletteTable(audit.cascade);
    console.log("\n   theme  floor  ratio  ink on plane");
    let paletteFails = 0;
    for (const theme of ["light", "dark"] as const) {
      const ps = planes(theme).filter(([n]) => n !== "line");
      for (const [inkName, ink, floor] of inks(theme)) {
        for (const [planeName, plane] of ps) {
          const r = contrast(ink, plane);
          if (r < floor) paletteFails++;
          console.log(
            `   ${theme.padEnd(6)} ${String(floor).padStart(4)}  ${r.toFixed(2).padStart(5)}  ` +
              `${inkName} on ${planeName} (${toHex(ink)} on ${toHex(plane)})`
          );
        }
      }
    }
    check("every ink clears its floor on every plane, in both themes", paletteFails === 0);
  }

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n\n${failures.map((f) => `  - ${f}`).join("\n")}\n` : "\n")
  );
  if (failures.length) process.exitCode = 1;
}

main();
