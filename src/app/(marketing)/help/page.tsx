"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ChevronDown, ChevronRight, LifeBuoy, Rocket, Wallet, ShieldCheck, Users, Mail, Info, ShoppingBag, Scale } from "lucide-react";
import { SUPPORT_EMAIL } from "@/config/company";
import { HELP_CATEGORIES } from "./help-articles";

interface Article { q: string; a: string }
interface Cat { title: string; icon: typeof Rocket; articles: Article[] }

const ICONS: Record<string, typeof Rocket> = {
  "About RevType": Info,
  "Marketplace, services & courses": ShoppingBag,
  "Rules & safety": Scale,
  "Getting started": Rocket,
  "Earning & tasks": Users,
  "Withdrawals & payments": Wallet,
  "Account & security": ShieldCheck,
};
const CATS: Cat[] = HELP_CATEGORIES.map((c) => ({ ...c, icon: ICONS[c.title] ?? LifeBuoy }));

export default function PublicHelpPage() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = CATS.map((c) => ({
    ...c,
    articles: c.articles.filter(
      (a) => !query || a.q.toLowerCase().includes(query.toLowerCase()) || a.a.toLowerCase().includes(query.toLowerCase())
    ),
  })).filter((c) => c.articles.length > 0);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-16 sm:pt-24">
      <div className="text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-(--mk-grad-a) to-(--mk-grad-b)">
          <LifeBuoy className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-(--mk-text) tracking-tight">Help Center &amp; FAQ</h1>
        <p className="mt-4 text-(--mk-muted)">
          Answers about how RevType works: freelance micro-tasks, selling digital products and services, courses, payouts and the rules that keep the platform fair. Search below or browse by topic.
        </p>
      </div>

      <div className="relative mt-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-(--mk-subtle)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles…"
          className="w-full rounded-2xl mk-card backdrop-blur-xl pl-12 pr-4 py-4 text-(--mk-text) placeholder:text-(--app-ink-3) focus:outline-none focus:border-blue-500/40"
        />
      </div>

      <div className="mt-8 space-y-4">
        {filtered.length === 0 && <p className="text-center text-sm text-(--mk-subtle) py-8">No articles match your search.</p>}
        {filtered.map((c) => (
          <div key={c.title} className="rounded-2xl mk-card backdrop-blur-xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-(--mk-border)">
              <c.icon className="h-4 w-4 text-(--mk-accent)" />
              <h2 className="text-sm font-bold text-(--mk-text)">{c.title}</h2>
            </div>
            <ul className="divide-y divide-(--mk-border)">
              {c.articles.map((a) => {
                const id = c.title + a.q;
                const isOpen = open === id;
                return (
                  <li key={a.q}>
                    <h3 className="m-0 text-sm font-normal">
                      <button onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen} className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-(--mk-surface-2)">
                        {isOpen ? <ChevronDown className="w-4 h-4 text-(--mk-muted) shrink-0" /> : <ChevronRight className="w-4 h-4 text-(--mk-muted) shrink-0" />}
                        <span className="text-sm text-(--mk-text) flex-1">{a.q}</span>
                      </button>
                    </h3>
                    {/* Always in the HTML (collapsed with `hidden`) so the answer
                        is readable without JavaScript and by crawlers. */}
                    <p hidden={!isOpen} className="px-12 pb-4 text-sm text-(--mk-muted) leading-relaxed">{a.a}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <nav aria-label="Related pages" className="mt-10 rounded-2xl mk-card p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-(--mk-subtle)">Learn more</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <li><Link href="/microtask" className="text-(--mk-accent) hover:underline">Every type of micro-task and how it is verified</Link></li>
          <li><Link href="/features/marketplace" className="text-(--mk-accent) hover:underline">Selling digital products and services</Link></li>
          <li><Link href="/features/courses" className="text-(--mk-accent) hover:underline">Taking and teaching online courses</Link></li>
          <li><Link href="/features/affiliate" className="text-(--mk-accent) hover:underline">The affiliate program for creators</Link></li>
          <li><Link href="/referral" className="text-(--mk-accent) hover:underline">How referral rewards work</Link></li>
          <li><Link href="/about" className="text-(--mk-accent) hover:underline">About RevType and how it is funded</Link></li>
          <li><Link href="/blog" className="text-(--mk-accent) hover:underline">Guides on the blog</Link></li>
          <li><Link href="/terms" className="text-(--mk-accent) hover:underline">Terms of Service and prohibited use</Link></li>
        </ul>
      </nav>

      <div className="mt-6 rounded-2xl mk-card p-6 text-center">
        <div className="mb-2 inline-flex items-center gap-2 text-(--mk-accent)"><Mail className="h-4 w-4" /><span className="text-sm font-bold uppercase tracking-wider">Still need help?</span></div>
        <p className="text-(--mk-muted) text-sm">Send us a message and the support team will reply by email. Members can also open a ticket from inside the app.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href="/contact" className="rounded-xl bg-linear-to-r from-(--mk-grad-a) to-(--mk-grad-b) px-5 py-2.5 text-sm font-bold text-white hover:scale-105 transition-transform">Contact support</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="rounded-xl border border-(--mk-border-strong) bg-(--mk-surface) px-5 py-2.5 text-sm font-semibold text-(--mk-text) hover:bg-(--mk-surface-2)">{SUPPORT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}
