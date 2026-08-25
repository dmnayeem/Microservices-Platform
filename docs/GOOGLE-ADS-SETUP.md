# Google ads: what the code does, and what only you can do

There is no AdSense or Ad Manager account yet — `ads.adsense_client` and
`ads.gam_network_code` are unset, so `NetworkScripts` renders nothing at all and
no Google script loads anywhere on the site. Everything below is either already
enforced in code or waiting on that account.

## The one rule that matters

**Users are paid to be on some of our pages. Google's ads must never appear on
those pages.** Both AdSense and Ad Manager prohibit ads on incentivised
placements, and breaking it is an account-level ban, not a warning.

The paid surfaces are listed once, in `INCENTIVISED_PREFIXES`
(`src/lib/ad-placements.ts`) — twenty-one of them today, every task type plus
the reward loops.

## What the code already enforces

| Layer | Where | What it stops |
|---|---|---|
| Slot policy | `networkAllowed: false` per placement, `src/lib/ad-placements.ts` | A Google creative being booked into a slot on a paid surface. Rejected with an explanatory message, not silently. |
| **Page script** | `src/components/providers/network-script-tags.tsx` | `adsbygoogle.js` / `gpt.js` loading **at all** on an incentivised path. |
| Anchor bar | `anchorAllowedOnPath()` | The sticky bottom bar, which carries Google inventory and is mounted once app-wide. |

The middle row is the important one and it is the one that was missing.
`NetworkScripts` sits in the **root layout**, so the tag would have loaded on
every screen the moment a publisher id was saved. The slot policy governs the
ads *we ask for*; **Auto ads** are injected by the page-level script wherever
Google decides, and no per-slot flag can stop them. The only thing that does is
the script not being on the page.

The check lives in `network-script-tags.tsx` and reads `usePathname()`. That
resolves during SSR as well as in the browser, so the tag is absent from the
server-rendered HTML on those routes — not merely unmounted after hydration,
which would be too late, because the HTML is what Google's reviewer fetches.

It does **not** use the `x-pathname` header, despite `src/lib/auth/config.ts`
appearing to set one. See the note at the end of this file.

`ANCHOR_DENY_PREFIXES` is now derived from the same list rather than being its
own array. It used to be just `["/watch-ads"]`, which was right for the bar and
far narrower than the real set of paid pages; two hand-kept lists of "pages
Google must not touch" would drift and the narrower one would win silently.

---

## When you get an AdSense account — your four steps

### 1. Save the publisher id

**Admin → Monetization → Ad networks → AdSense publisher id** (`ca-pub-…`).
Nothing loads until this is set.

### 2. Exclude the paid pages

Don't retype the list — generate it:

```bash
npx tsx --tsconfig tsconfig.script.json scripts/print-adsense-exclusions.ts
```

Paste the output into **AdSense → Ads → By site → *your domain* → Edit →
Excluded URLs**. (Ad Manager: **Inventory → Ad exclusions**.)

This is the second lock. The code already refuses to load the script there; this
covers the case where Auto ads are enabled account-wide and a path is reached in
a way the route check does not see. Re-run the script whenever a task type is
added — it prints from the same constant the code enforces.

### 3. Create the consent message (Funding Choices)

Required for EEA/UK/Swiss traffic. Google stops serving there without a
certified TCF v2.2 platform, and our own cookie banner can never be one.

1. **AdSense → Privacy & messaging → GDPR** → create a message
2. Choose the ad-serving option (consent or pay), pick the languages, publish
3. Turn on **Admin → Monetization → Google certified CMP**
4. Load the site from an EEA IP and confirm
   `fundingchoicesmessages.google.com` appears in the network tab

Our banner stands down automatically when that toggle is on — `layout.tsx`
passes `ui.cookiesPopup && !googleCmp`. Without that, a visitor got asked twice
and the answer Google read was the one from the certified CMP anyway.

**Do not enable the toggle before publishing a message.** The script loads,
finds no message, and shows nothing — which looks exactly like a broken banner.

### 4. Verify before you rely on it

View source on `/dashboard` and on `/tasks`:

- `/dashboard` → `pagead2.googlesyndication.com` present
- `/tasks` → **absent**

If it appears on `/tasks`, the route is missing from `INCENTIVISED_PREFIXES` —
that list is the single point the suppression depends on.

---

## Rewarded video

`ads.rewarded_enabled` ships **off** deliberately. Rewarded formats are
incentivised by definition and need their own Google approval; the
`REWARDED_VIDEO` placement is `networkAllowed: false` so it can only ever carry
house or direct-sold creatives.

---

## Known issue found while building this: `x-pathname` is never delivered

`src/lib/auth/config.ts` builds a pass-through response carrying an
`x-pathname` header, intended for server components. **It does not arrive.**
NextAuth discards the response its `authorized` callback returns when the
request is allowed and returns its own `NextResponse.next()`, so the modified
request headers are dropped.

Measured, not inferred: a probe in the root layout logged `x-pathname` as `""`
on `/`, `/login`, `/cookies` and `/offer/test`, before and after a clean dev
restart and a cleared Turbopack cache. Wrapping the middleware as
`auth((req) => …)` did not help either — with an `authorized` callback present
the wrapped handler is never invoked.

That is why the ad-script gate uses `usePathname()` instead.

**It also means `src/app/admin/layout.tsx`'s central route guard is inert.** It
reads the same header and is written as `if (pathname && !pathname.startsWith(…))`,
so with an empty pathname the permission check is skipped entirely. Admin *APIs*
are still guarded individually by `can()`, so this is defence-in-depth that is
missing rather than an open door — but it should be fixed, and fixing it means
restructuring how the auth middleware returns its response, which is a change
worth making on its own rather than alongside an ads task.
