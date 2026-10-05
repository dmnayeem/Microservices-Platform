import type { Metadata } from "next";
import Link from "next/link";
import {
  ShoppingBag,
  Image as ImageIcon,
  Music,
  FileText,
  Code2,
  Palette,
  Handshake,
  ShieldCheck,
  Zap,
  Wallet,
  Globe2,
  Upload,
  BadgeCheck,
  CreditCard,
  ArrowRight,
} from "lucide-react";
import {
  Section,
  SectionHeading,
  GlassCard,
  StatGrid,
  PrimaryButton,
  GhostButton, MarketingHero, CtaBand
} from "@/components/marketing/ui";
import { COMPANY_NAME } from "@/config/company";
import { pageMeta } from "@/lib/seo/page-meta";

export function generateMetadata(): Promise<Metadata> {
  return pageMeta({
    title: "Digital Marketplace — Products & Services",
    // ≤155 chars — what Google shows uncut.
    description: `Sell digital products and freelance services on ${COMPANY_NAME}: reviewed listings, automatic download delivery and escrow for service deals.`,
    path: "/features/marketplace",
  });
}

const STATS = [
  { value: "Reviewed", label: "Every listing, before it goes live" },
  { value: "Automatic", label: "Delivery of digital downloads" },
  { value: "Escrow", label: "Protected payments" },
  { value: "Yours", label: "You set every price" },
];

const CATEGORIES = [
  { icon: Palette, title: "Graphics & Templates", body: "UI kits, presentation decks, social templates, print designs, and reusable creative assets." },
  { icon: ImageIcon, title: "Stock Photos & Video", body: "License your photography and footage. Buyers filter by resolution, style, and asset age." },
  { icon: Music, title: "Music & Audio", body: "Beats, loops, sound effects, and background tracks for creators and businesses." },
  { icon: FileText, title: "Ebooks & Guides", body: "Sell knowledge as downloadable ebooks, playbooks, and study material." },
  { icon: Code2, title: "Software & Digital Tools", body: "Scripts, plugins, spreadsheets, and digital utilities delivered as secure downloads." },
  { icon: Handshake, title: "Services & Custom Work", body: "Offer freelance services — design, writing, editing, development and more. Each service listing states what you deliver, the turnaround and the revisions included, and deals run through escrow with built-in chat and admin mediation." },
];

const STEPS = [
  { icon: Upload, title: "Apply and list", body: "Apply to sell, then upload your files or describe your service, write a clear description, and set your own price." },
  { icon: BadgeCheck, title: "Get approved", body: "Every listing gets a quality-and-safety review before it is published, so buyers know what they are getting." },
  { icon: CreditCard, title: "Buyers purchase", body: "Digital downloads unlock after payment. Service work and negotiated deals are paid into escrow and released when delivery is confirmed." },
  { icon: Wallet, title: "Get paid", body: "Your share of each sale, after the platform fee, lands in your wallet, ready to withdraw under the usual withdrawal rules." },
];

const BUYER = [
  { icon: Zap, title: "Automatic delivery", body: "Digital downloads unlock as soon as payment clears — no waiting for the seller." },
  { icon: ShieldCheck, title: "Escrow for services", body: "Custom work and negotiated deals are held in escrow, with admin mediation if a delivery is disputed." },
  { icon: Globe2, title: "Reviewed listings", body: "Every product and service is checked by the team before it appears in the marketplace." },
];

export default function MarketplaceFeaturePage() {
  return (
    <>
      <MarketingHero
        badge="Digital Marketplace"
        title="Sell your digital products to"
        highlight="buyers worldwide"
        subtitle="Sell templates, graphics, ebooks, stock media, code or your own services — or buy ready-made work for your next project."
        actions={
          <>
            <PrimaryButton href="/register">
              <ShoppingBag className="h-4 w-4" /> Start selling
            </PrimaryButton>
            <GhostButton href="/marketplace">Browse the marketplace →</GhostButton>
          </>
        }
      />

      <Section className="bg-(--mk-band)">
        <StatGrid stats={STATS} />
      </Section>

      {/* What you can sell */}
      <Section>
        <SectionHeading
          badge="What you can sell"
          tone="emerald"
          title="A storefront for every kind of digital work"
          subtitle="Digital goods and services only — no physical products. You set your own prices."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <GlassCard key={c.title}>
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 shadow-sm">
                <c.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-(--mk-text)">{c.title}</h3>
              <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{c.body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* How selling works */}
      <Section className="bg-(--mk-band)">
        <SectionHeading
          badge="How selling works"
          title="From upload to payout in four steps"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <GlassCard key={s.title} className="relative pt-8">
              <span className="absolute -top-3 left-6 inline-flex h-8 w-8 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-teal-600 text-sm font-extrabold text-white shadow-sm">
                {i + 1}
              </span>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-(--mk-success)/10 border border-emerald-500/20">
                <s.icon className="h-5 w-5 text-(--mk-success)" />
              </div>
              <h3 className="font-bold text-(--mk-text)">{s.title}</h3>
              <p className="mt-1.5 text-sm text-(--mk-muted) leading-relaxed">{s.body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* Buyer benefits */}
      <Section>
        <SectionHeading
          badge="For buyers"
          tone="cyan"
          title="Shop with total confidence"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {BUYER.map((b) => (
            <GlassCard key={b.title}>
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b) shadow-sm">
                <b.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-(--mk-text)">{b.title}</h3>
              <p className="mt-2 text-sm text-(--mk-muted) leading-relaxed">{b.body}</p>
            </GlassCard>
          ))}
        </div>
      </Section>

      {/* Affiliate tie-in */}
      <Section width="narrow">
        <GlassCard className="sm:p-10">
          <div className="mb-3 inline-flex items-center gap-2 text-(--mk-accent)">
            <Handshake className="w-5 h-5" />
            <span className="text-sm font-bold uppercase tracking-wider">Sell more, effortlessly</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-(--mk-text)">
            Let others promote your products
          </h2>
          <p className="mt-3 text-(--mk-muted) leading-relaxed">
            Enable an affiliate reward on any listing and a community of
            promoters will share your products for you — you only pay a
            commission when they make a sale.
          </p>
          <Link
            href="/features/affiliate"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-(--mk-accent) hover:text-(--mk-accent)"
          >
            Learn about the affiliate program <ArrowRight className="w-4 h-4" />
          </Link>
        </GlassCard>
      </Section>

      {/* Final CTA */}
      <Section>
        <CtaBand
          title="Turn your digital work into income"
          subtitle={
            <>
              Create a free account and apply to sell. Questions about fees, delivery or disputes? The{" "}
              <Link href="/help">Help Center</Link> covers them — or <Link href="/features/courses">teach a course</Link>.
            </>
          }
          primary={{ href: "/register", label: <><ShoppingBag className="h-4 w-4" /> Create a free account</> }}
          secondary={{ href: "/features/affiliate", label: "Explore affiliate →" }}
        />
      </Section>
    </>
  );
}
