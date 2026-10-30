import type { Metadata } from "next";
import { MousePointerClick, CalendarRange, ClipboardList } from "lucide-react";
import {
  PageHero,
  Band,
  SectionHead,
  Facts,
  Rows,
  Steps,
  Tile,
  Btn,
  Faq,
  Closing,
} from "@/components/marketing/kit";
import { AdvertiseMock } from "@/components/marketing/mocks";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbLd } from "@/lib/seo/breadcrumbs";
import { AD_PLACEMENTS, placementSpec } from "@/lib/ad-placements";
import { BUYER_TASK_TYPES, BUYER_TASK_TYPE_META } from "@/lib/buyer-task-types";
import { COMPANY_NAME } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";

/**
 * Public explainer for advertisers.
 *
 * The space list is rendered FROM `AD_PLACEMENTS`, the same array the renderer
 * and the Ad Manager read: a hand-typed list would drift the first time a
 * space is added, and an advertiser who bought a space that no longer exists
 * is a refund conversation.
 *
 * Two deliberate omissions:
 *  - REWARDED_VIDEO is filtered out. It exists in the codebase but ships OFF,
 *    and a marketing page must not sell inventory that does not run.
 *  - No prices. The click price is a setting (`ads.cpcUsd`) with a per-space
 *    override, and sponsorship rates are per-space columns. The hero mock's
 *    figures are labelled "Example" for the same reason.
 */

// PAGE_SCRIPT is the site-wide network page-script space — never sold.
const SELLABLE = AD_PLACEMENTS.filter((p) => p.name !== "REWARDED_VIDEO" && p.name !== "PAGE_SCRIPT");
const SLOT_COUNT = SELLABLE.length;
const NETWORK_SPACES = SELLABLE.filter((p) => placementSpec(p.name).networkAllowed);
const TASK_KINDS = BUYER_TASK_TYPES.map((t) => BUYER_TASK_TYPE_META[t].label.toLowerCase());
const taskKindList = `${TASK_KINDS.slice(0, -1).join(", ")} and ${TASK_KINDS[TASK_KINDS.length - 1]}`;

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    // ≤50 chars + " | RevType", description ≤155 — what Google shows uncut.
    title: "Advertise — Ads, Sponsorships and Paid Tasks",
    description:
      `Advertise on ${COMPANY_NAME}: pay per click across ${SLOT_COUNT} ad spaces, sponsor a space ` +
      `outright, or pay real people to complete tasks for your brand.`,
    path: "/advertise",
  });
}

const BUY_MODES = [
  {
    icon: MousePointerClick,
    title: "Pay per click",
    body: "You're charged when someone clicks. Each space can carry its own price; the rest use the platform rate.",
    visual: "Charged per click",
  },
  {
    icon: CalendarRange,
    title: "Sponsor a space",
    body: "Rent a space outright for a period, so your creative is the only one that runs there.",
    visual: "Exclusive for a set period",
  },
  {
    icon: ClipboardList,
    title: "Pay for the work",
    body: `Create ${taskKindList} tasks. Fund them up front, set the proof you need and review what comes back.`,
    visual: "Real people, verified proof",
  },
];

const WHY = [
  {
    title: "Attention, not scrolling",
    body: "People come here to get work done. Your ad sits on a screen someone is already focused on.",
  },
  {
    title: "You choose the screen",
    body: "The feed, the wallet, a video task, the withdrawal page — each space is bought on its own.",
  },
  {
    title: "Clicks, priced at the moment",
    body: "The price in force when a click happens is the one recorded, so your reports never rewrite themselves.",
  },
  {
    title: "Reports per space",
    body: "Impressions, clicks and spend for every placement, so you can see which screen works.",
  },
  {
    title: "A budget you control",
    body: "Set a total and a daily cap. A campaign that runs out of budget pauses itself.",
  },
];

const RULES = [
  {
    title: "Reviewed before it runs",
    body: "Our team approves every ad. Changing anything that matters sends it back for review — creatives are never swapped silently.",
  },
  {
    title: "Every space has a shape",
    body: "Each placement declares the sizes it accepts and a height limit, so no creative can take over a page.",
  },
  {
    title: "Funded before it serves",
    body: "A campaign only runs while it has budget left, and spend is recorded the moment it happens.",
  },
];

const FAQ = [
  {
    q: "How much does advertising cost?",
    a: "Prices are set per space and shown in the Ad Manager before you commit a budget. Clicks are charged at the price in force when the click happens, and you set both the total budget and a daily cap.",
  },
  {
    q: "Can I choose where my ad appears?",
    a: `Yes. There are ${SLOT_COUNT} ad spaces, and each one is chosen, priced and reported on separately.`,
  },
  {
    q: "What does “Direct only” mean?",
    a: "Those spaces sit on screens where the viewer is being rewarded, so we sell them directly and never fill them from an ad network.",
  },
  {
    q: "How long does ad review take?",
    a: "Every ad is checked by our team before it can serve. If anything needs changing, you're told what and why.",
  },
  {
    q: "Can I pay people to do tasks instead of running ads?",
    a: `Yes. You can create ${taskKindList} tasks, fund them up front and approve or reject each submission.`,
  },
];

export default function AdvertisePage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Advertise", path: "/advertise" }])} />

      <PageHero
        kicker="Advertise"
        title="Ads people actually see."
        accent="Pay per click, sponsor or hire."
        lead={`${SLOT_COUNT} ad spaces across ${COMPANY_NAME}, from the feed to the wallet. Pay per click, sponsor a space outright, or pay real people to complete tasks for your brand.`}
        actions={
          <>
            <Btn href="/profile/become-creator">Apply to advertise</Btn>
            <Btn href="/contact" variant="secondary">
              Talk to us about sponsorship
            </Btn>
          </>
        }
        note="Every ad is reviewed before it runs"
        visual={<AdvertiseMock />}
      />

      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <Facts
          items={[
            { value: String(SLOT_COUNT), label: "Ad spaces" },
            { value: String(BUY_MODES.length), label: "Ways to buy" },
            { value: "Per click", label: "Default pricing" },
            { value: "Per space", label: "Reports and prices" },
          ]}
        />
      </div>

      <Band id="buy" labelledBy="buy-title">
        <SectionHead
          id="buy-title"
          n="01"
          label="Ways to buy"
          title="Three ways to spend a budget"
          lead="Rates are set per space and can change. You always see today's price in the Ad Manager before you commit."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {BUY_MODES.map((m) => (
            <Tile
              key={m.title}
              title={m.title}
              body={m.body}
              visual={
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-(--mk-border) bg-(--mk-surface-2) text-(--mk-accent)">
                    <m.icon aria-hidden className="h-5 w-5" />
                  </span>
                  <span className="text-sm text-(--mk-subtle)">{m.visual}</span>
                </div>
              }
            />
          ))}
        </div>
      </Band>

      <Band id="benefits" labelledBy="why-title" alt>
        <SectionHead
          id="why-title"
          n="02"
          label="Why here"
          title="What a general ad network can't give you"
        />
        <Rows items={WHY} />
      </Band>

      <Band id="slots" labelledBy="slots-title">
        <SectionHead
          id="slots-title"
          n="03"
          label="Ad spaces"
          title={`All ${SLOT_COUNT} placements`}
          lead={`The complete list, exactly as the platform defines it. ${NETWORK_SPACES.length} accept network creatives; “Direct only” spaces are sold by us alone.`}
        />
        <ul className="grid border-t border-(--mk-border) sm:grid-cols-2 lg:grid-cols-3">
          {SELLABLE.map((p) => (
            <li key={p.name} className="mkx-reveal border-b border-(--mk-border) py-5 sm:pr-8">
              <div className="flex items-start justify-between gap-3">
                <h3 className="mkx-h3 text-[0.9375rem]!">{p.label}</h3>
                {!placementSpec(p.name).networkAllowed && (
                  <span className="shrink-0 rounded-full border border-(--mk-border-strong) px-2 py-0.5 text-[11px] font-semibold text-(--mk-subtle)">
                    Direct only
                  </span>
                )}
              </div>
              {/* The route in brackets is for the Ad Manager, not a visitor. */}
              <p className="mt-1.5 text-sm leading-relaxed text-(--mk-muted)">{p.where.replace(/\s*\(\/[^)]*\)/g, "")}</p>
            </li>
          ))}
        </ul>
      </Band>

      <Band labelledBy="rules-title" alt>
        <SectionHead
          id="rules-title"
          n="04"
          label="Standards"
          title="Rules that protect both sides"
          lead="The same rules apply to every advertiser, and they are enforced by the platform itself."
        />
        <Steps items={RULES} prefix="" />
      </Band>

      <Band labelledBy="faq-title">
        <Faq id="faq-title" items={FAQ} />
      </Band>

      <Closing
        title="Ready to run your first campaign?"
        lead="Apply for advertiser access, fund a campaign and pick your spaces. Current rates are in the Ad Manager."
        primary={{ href: "/profile/become-creator", label: "Apply to advertise" }}
        secondary={{ href: "/microtask", label: "See what workers do" }}
      />
    </>
  );
}
