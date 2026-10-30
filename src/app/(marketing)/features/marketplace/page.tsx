import type { Metadata } from "next";
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
import { MarketplaceMock } from "@/components/marketing/mocks";
import { COMPANY_NAME } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";

// Breadcrumb data comes from this route's layout.tsx.

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Digital Marketplace — Sell Products & Services",
    // ≤155 chars — what Google shows uncut.
    description: `Sell templates, graphics, ebooks, stock media, code and freelance services on ${COMPANY_NAME}. Reviewed listings, instant downloads and escrow for custom work.`,
    path: "/features/marketplace",
  });
}

const CATEGORIES = [
  { title: "Graphics & templates", body: "UI kits, decks, social templates, print designs and reusable creative assets.", meta: "Instant download" },
  { title: "Stock photos & video", body: "License your photography and footage to creators and businesses.", meta: "Instant download" },
  { title: "Music & audio", body: "Beats, loops, sound effects and background tracks.", meta: "Instant download" },
  { title: "Ebooks & guides", body: "Playbooks, study material and anything you can teach in a document.", meta: "Instant download" },
  { title: "Software & tools", body: "Scripts, plugins, spreadsheets and other digital utilities.", meta: "Instant download" },
  {
    title: "Services & custom work",
    body: "Design, writing, editing, development and more. Each listing states what you deliver, the turnaround and the revisions included.",
    meta: "Paid through escrow",
  },
];

const SELL_STEPS = [
  { title: "Apply and list", body: "Get approved as a seller, then upload your files or describe your service and set your price." },
  { title: "Pass review", body: "Every listing is checked for quality and safety before it goes live." },
  { title: "Make the sale", body: "Downloads unlock as soon as payment clears. Service work is paid into escrow." },
  { title: "Get paid", body: "Your share, after the platform fee, lands in your wallet, ready to withdraw." },
];

const ESCROW = [
  { title: "Buyer pays", body: "The money is held by the platform, not sent to the seller." },
  { title: "Seller delivers", body: "Work and messages stay in the deal's built-in chat." },
  { title: "Buyer confirms", body: "Delivery accepted? The payment is released to the seller." },
  { title: "Disagreement?", body: "Either side can ask our team to step in and mediate." },
];

const FAQ = [
  {
    q: "What can I sell?",
    a: "Digital products — templates, graphics, stock photos and video, music and audio, ebooks and guides, software and tools — plus freelance services. Physical goods are not sold here.",
  },
  {
    q: "Do I need approval to sell?",
    a: "Yes. Selling requires an approved seller application, and every listing is reviewed before it goes live.",
  },
  {
    q: `What does ${COMPANY_NAME} charge?`,
    a: "A platform fee is taken from each sale. Your share goes to your wallet and is withdrawn under the usual withdrawal rules.",
  },
  {
    q: "How does escrow work for services?",
    a: "The buyer's payment is held until delivery is confirmed. Both sides talk in the deal's chat, and our team mediates if there's a dispute.",
  },
  {
    q: "Can other people promote my products?",
    a: "Yes. Turn on an affiliate reward for a listing and affiliates can share it with their own link. You pay a commission only when they make a sale.",
  },
];

export default function MarketplaceFeaturePage() {
  return (
    <>
      <PageHero
        kicker="Digital marketplace"
        title="Sell what you make."
        accent="Delivered and paid for safely."
        lead="Templates, graphics, ebooks, stock media, code and freelance services. Listings are reviewed, downloads unlock the moment payment clears, and custom work runs through escrow."
        actions={
          <>
            <Btn href="/register">Start selling</Btn>
            <Btn href="/marketplace" variant="secondary">
              Browse the marketplace
            </Btn>
          </>
        }
        note="Digital goods and services only · You set every price"
        visual={<MarketplaceMock />}
      />

      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        <Facts
          items={[
            { value: String(CATEGORIES.length), label: "Kinds of listing" },
            { value: "Reviewed", label: "Every listing, before launch" },
            { value: "Instant", label: "Download delivery" },
            { value: "Escrow", label: "For custom work" },
          ]}
        />
      </div>

      <Band labelledBy="sell-title">
        <SectionHead
          id="sell-title"
          n="01"
          label="What you can sell"
          title="A storefront for digital work"
          lead="Files deliver themselves. Services are paid into escrow and released when the buyer confirms delivery."
        />
        <Rows items={CATEGORIES} />
      </Band>

      <Band labelledBy="how-title" alt>
        <SectionHead id="how-title" n="02" label="Selling" title="From upload to payout" />
        <Steps items={SELL_STEPS} />
      </Band>

      <Band labelledBy="escrow-title">
        <SectionHead
          id="escrow-title"
          n="03"
          label="Escrow"
          title="Custom work, paid only on delivery"
          lead="Services and negotiated deals never move money straight to the seller. It waits until the work is accepted."
        />
        <Steps items={ESCROW} prefix="" />
      </Band>

      <Band labelledBy="more-title" alt>
        <SectionHead id="more-title" n="04" label="Grow" title="Sell more without doing more" />
        <div className="grid gap-4 md:grid-cols-2">
          <Tile
            href="/features/affiliate"
            cta="How the affiliate program works"
            title="Let affiliates promote your listings"
            body="Turn on an affiliate reward and others share your product with their own link. You pay a commission only when they make a sale."
          />
          <Tile
            href="/features/courses"
            cta="Teach a course"
            title="Teach what you sell"
            body="Turn your expertise into a course with video lessons, quizzes and a completion certificate."
          />
        </div>
      </Band>

      <Band labelledBy="faq-title">
        <Faq id="faq-title" items={FAQ} />
      </Band>

      <Closing
        title="Turn your digital work into income."
        lead="Create a free account and apply to sell. Your first listing can be live as soon as it passes review."
        primary={{ href: "/register", label: "Create a free account" }}
        secondary={{ href: "/marketplace", label: "Browse the marketplace" }}
      />
    </>
  );
}
