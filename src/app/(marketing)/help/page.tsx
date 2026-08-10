"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ChevronDown, ChevronRight, LifeBuoy, Rocket, Wallet, ShieldCheck, Users, Mail } from "lucide-react";
import { SUPPORT_EMAIL } from "@/config/company";

interface Article { q: string; a: string }
interface Cat { title: string; icon: typeof Rocket; articles: Article[] }

const CATS: Cat[] = [
  {
    title: "Getting started",
    icon: Rocket,
    articles: [
      { q: "How do I create an account?", a: "Tap Sign Up, enter your email, and verify it — that's it. Creating an account is free and takes under a minute." },
      { q: "How do I earn?", a: "Complete simple tasks, paid surveys, watch-and-engage activities, and offers. You can also earn by referring people you trust and from daily bonuses." },
      { q: "Is it really free?", a: "Yes. It's free to join and free to earn. We never ask you to pay to withdraw — legitimate platforms pay you, not the other way around." },
      { q: "Which countries is it available in?", a: "EarnGPT works in 180+ countries. Some payout methods and offers vary by region, and you'll always see what's available to you." },
    ],
  },
  {
    title: "Earning & tasks",
    icon: Users,
    articles: [
      { q: "What kinds of tasks are there?", a: "Micro-tasks, quizzes, paid surveys, video and social activities, app/offer rewards, and more. Each task shows exactly what's required before you start." },
      { q: "How long does approval take?", a: "Most tasks approve instantly. A few need a quick manual review, which usually completes within 24 hours." },
      { q: "Why was my submission rejected?", a: "Usually invalid or incomplete proof, a duplicate, or a fraud flag. You'll get a note explaining the specific reason so you can fix it next time." },
      { q: "How do referrals work?", a: "Invite people with your link and earn a commission on their qualifying activity across multiple levels — without reducing what they earn." },
    ],
  },
  {
    title: "Withdrawals & payments",
    icon: Wallet,
    articles: [
      { q: "How do I withdraw my earnings?", a: "Convert your points to cash and request a withdrawal to your chosen method. You'll see the minimum amount before you confirm." },
      { q: "What payout methods are supported?", a: "PayPal, bank transfer, Wise, Payoneer, Skrill, gift cards, and crypto (USDT/BTC). Availability can vary slightly by country." },
      { q: "How long do withdrawals take?", a: "Most payouts are processed within 24–48 hours; crypto is usually faster. Larger or first-time withdrawals may go through a quick security review." },
      { q: "Why do you verify some withdrawals?", a: "To protect everyone and keep fraud out, so genuine members always get paid. Completing identity verification early keeps your payouts fast." },
    ],
  },
  {
    title: "Account & security",
    icon: ShieldCheck,
    articles: [
      { q: "How do I keep my account secure?", a: "Use a unique, strong password and enable two-factor authentication. We'll never ask for your password or one-time codes." },
      { q: "I can't log in — what do I do?", a: "Reset your password from the login page. If you're still stuck, contact support and we'll help you recover access." },
      { q: "How is my data protected?", a: "Traffic is encrypted, sensitive data is protected, and we honor privacy rights like GDPR and CCPA. We never sell your personal data." },
      { q: "How do I delete my account?", a: "You can request deletion from your account settings. It's permanent, so make sure you've withdrawn any balance first." },
    ],
  },
];

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
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-blue-500 to-purple-600">
          <LifeBuoy className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-(--mk-text) tracking-tight">How can we help?</h1>
        <p className="mt-4 text-(--mk-muted)">Search our guides or browse the topics below. Still stuck? We&apos;re here 24/7.</p>
      </div>

      <div className="relative mt-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-(--mk-subtle)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles…"
          className="w-full rounded-2xl bg-(--mk-surface) border border-(--mk-border) backdrop-blur-xl pl-12 pr-4 py-4 text-(--mk-text) placeholder-slate-500 focus:outline-none focus:border-blue-500/40"
        />
      </div>

      <div className="mt-8 space-y-4">
        {filtered.length === 0 && <p className="text-center text-sm text-(--mk-subtle) py-8">No articles match your search.</p>}
        {filtered.map((c) => (
          <div key={c.title} className="rounded-2xl bg-(--mk-surface) border border-(--mk-border) backdrop-blur-xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-(--mk-border)">
              <c.icon className="h-4 w-4 text-indigo-600" />
              <p className="text-sm font-bold text-(--mk-text)">{c.title}</p>
            </div>
            <ul className="divide-y divide-(--mk-border)">
              {c.articles.map((a) => {
                const id = c.title + a.q;
                const isOpen = open === id;
                return (
                  <li key={a.q}>
                    <button onClick={() => setOpen(isOpen ? null : id)} className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-(--mk-surface-2)">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-(--mk-muted) shrink-0" /> : <ChevronRight className="w-4 h-4 text-(--mk-muted) shrink-0" />}
                      <span className="text-sm text-(--mk-text) flex-1">{a.q}</span>
                    </button>
                    {isOpen && <p className="px-12 pb-4 text-sm text-(--mk-muted) leading-relaxed">{a.a}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl bg-(--mk-surface) border border-(--mk-border) p-6 text-center">
        <div className="mb-2 inline-flex items-center gap-2 text-indigo-600"><Mail className="h-4 w-4" /><span className="text-sm font-bold uppercase tracking-wider">Still need help?</span></div>
        <p className="text-(--mk-muted) text-sm">Our support team replies around the clock.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href="/contact" className="rounded-xl bg-linear-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:scale-105 transition-transform">Contact support</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="rounded-xl border border-(--mk-border-strong) bg-(--mk-surface) px-5 py-2.5 text-sm font-semibold text-(--mk-text) hover:bg-(--mk-surface-2)">{SUPPORT_EMAIL}</a>
        </div>
      </div>
    </div>
  );
}
