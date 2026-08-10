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
  GhostButton,
  BadgePill,
} from "@/components/marketing/ui";
import { COMPANY_NAME } from "@/config/company";

export const metadata: Metadata = {
  title: "Digital Marketplace — Sell & Buy Digital Products",
  description: `Sell templates, graphics, ebooks, stock photos, and music to buyers worldwide on ${COMPANY_NAME} — or shop thousands of ready-made digital assets. Secure escrow, instant delivery, your price.`,
};

const STATS = [
  { value: "180+", label: "Countries you can sell to" },
  { value: "Instant", label: "Automatic delivery" },
  { value: "Escrow", label: "Protected payments" },
  { value: "Yours", label: "You set every price" },
];

const CATEGORIES = [
  { icon: Palette, title: "Graphics & Templates", body: "UI kits, presentation decks, social templates, print designs, and reusable creative assets." },
  { icon: ImageIcon, title: "Stock Photos & Video", body: "License your photography and footage. Buyers filter by resolution, style, and asset age." },
  { icon: Music, title: "Music & Audio", body: "Beats, loops, sound effects, and background tracks for creators and businesses." },
  { icon: FileText, title: "Ebooks & Guides", body: "Sell knowledge as downloadable ebooks, playbooks, and study material." },
  { icon: Code2, title: "Software & Digital Tools", body: "Scripts, plugins, spreadsheets, and digital utilities delivered as secure downloads." },
  { icon: Handshake, title: "Services & Custom Work", body: "Offer custom work through escrow-protected deals with built-in chat and admin mediation." },
];

const STEPS = [
  { icon: Upload, title: "Create your listing", body: "Upload your files, write a description, and set your own price. It takes minutes." },
  { icon: BadgeCheck, title: "Get approved", body: "Our team runs a quick quality-and-safety review so buyers always trust what they get." },
  { icon: CreditCard, title: "Buyers purchase", body: "Shoppers check out securely. Funds are held in escrow until delivery is confirmed." },
  { icon: Wallet, title: "Get paid", body: "Files deliver automatically and your earnings land in your wallet, ready to withdraw." },
];

const BUYER = [
  { icon: Zap, title: "Instant delivery", body: "Downloads unlock the moment payment clears — no waiting, no back-and-forth." },
  { icon: ShieldCheck, title: "Buyer protection", body: "Every purchase is backed by escrow and admin mediation if anything goes wrong." },
  { icon: Globe2, title: "Global catalog", body: "Thousands of digital assets from creators around the world, added every day." },
];

export default function MarketplaceFeaturePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-emerald-500/10 to-transparent"
        />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-16 pb-10 sm:pt-24 sm:pb-14">
          <div className="mb-5">
            <BadgePill tone="emerald">Digital Marketplace</BadgePill>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-(--mk-text) tracking-tight leading-[1.1]">
            Sell your digital products to{" "}
            <span className="bg-linear-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
              buyers worldwide
            </span>
          </h1>
          <p className="mt-6 text-lg text-(--mk-muted) leading-relaxed max-w-2xl mx-auto">
            Templates, graphics, ebooks, stock photos, music, and more — list
            your work once and earn on every sale. Or shop thousands of
            ready-made digital assets for your next project.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <PrimaryButton href="/register">
              <ShoppingBag className="h-4 w-4" /> Start selling
            </PrimaryButton>
            <GhostButton href="/register">Browse the marketplace →</GhostButton>
          </div>
        </div>
      </section>

      <Section className="bg-(--mk-band)">
        <StatGrid stats={STATS} />
      </Section>

      {/* What you can sell */}
      <Section>
        <SectionHeading
          badge="What you can sell"
          tone="emerald"
          title="A storefront for every kind of digital work"
          subtitle="If it's digital, you can sell it. Keep 100% ownership and set your own prices."
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
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <s.icon className="h-5 w-5 text-emerald-600" />
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
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-sky-500 to-blue-600 shadow-sm">
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
          <div className="mb-3 inline-flex items-center gap-2 text-fuchsia-600">
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
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-fuchsia-600 hover:text-fuchsia-700"
          >
            Learn about the affiliate program <ArrowRight className="w-4 h-4" />
          </Link>
        </GlassCard>
      </Section>

      {/* Final CTA */}
      <Section>
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-emerald-600 to-teal-600 p-8 sm:p-12 text-center shadow-xl shadow-emerald-600/20">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            Turn your digital work into income
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-emerald-50">
            Create a free account and open your storefront today. It only takes a
            few minutes to list your first product.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-50 transition-colors shadow-sm"
            >
              <ShoppingBag className="h-4 w-4" /> Start selling free
            </Link>
            <Link
              href="/features/affiliate"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/40 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              Explore affiliate →
            </Link>
          </div>
        </div>
      </Section>
    </>
  );
}
