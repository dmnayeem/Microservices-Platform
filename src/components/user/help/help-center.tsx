"use client";

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Article {
  q: string;
  a: string;
}

interface Section {
  icon: string;
  title: string;
  articles: Article[];
}

const SECTIONS: Section[] = [
  {
    icon: "📋",
    title: "Getting Started",
    articles: [
      {
        q: "How to earn?",
        a: "Complete tasks (manual, quiz, social, proxy, surveys), watch videos, refer friends, sell on the marketplace, and play the lottery. Each action awards points and XP. 1,000 points = $1.00 USD.",
      },
      {
        q: "How do withdrawals work?",
        a: "Convert points to cash, then withdraw via your linked payment method (bKash, Nagad, Binance, PayPal, etc). Minimum withdrawal varies by tier. FREE tier cannot withdraw — upgrade to STARTER or higher.",
      },
      {
        q: "What are packages?",
        a: "Packages (FREE/STARTER/PRO/ELITE/VIP) unlock higher withdrawal limits, earning multipliers, fee discounts, and priority support. Upgrade any time from /packages.",
      },
    ],
  },
  {
    icon: "💰",
    title: "Earning & Tasks",
    articles: [
      {
        q: "What types of tasks are available?",
        a: "Manual tasks (with proof submission), quiz tasks, social tasks across 15 platforms, social post tasks, proxy tasks (timed sessions), board tasks (themed bundles), and offerwalls.",
      },
      {
        q: "How long does approval take?",
        a: "Auto-approved tasks credit instantly. Manual review tasks typically take 24-48 hours. Social tasks may require retention checks (3-30 days).",
      },
      {
        q: "Why was my submission rejected?",
        a: "Common reasons: invalid proof, incomplete task, wrong format, fraud detection, or duplicate submission. The admin note will tell you what to fix — most rejections allow a revision.",
      },
      {
        q: "What is task cooldown?",
        a: "After completing a task, you may need to wait before doing it again. This prevents spam and ensures quality. Cooldown is shown on each task card.",
      },
    ],
  },
  {
    icon: "🏦",
    title: "Withdrawals",
    articles: [
      {
        q: "What is the minimum withdrawal?",
        a: "FREE: locked. STARTER: $5. PRO: $10. ELITE: $20. VIP: $50.",
      },
      {
        q: "What payment methods are supported?",
        a: "bKash, Nagad, Binance Pay, PayPal, bank transfer (select countries), and crypto (USDT/BTC).",
      },
      {
        q: "How long do withdrawals take?",
        a: "Mobile wallets (bKash, Nagad): 1-24 hours. Crypto: under 1 hour. Bank transfers: 2-5 business days. PayPal: 1-3 business days.",
      },
    ],
  },
  {
    icon: "🔒",
    title: "Security",
    articles: [
      {
        q: "How do I enable 2FA?",
        a: "Go to /2fa-setup. Scan the QR code with Google Authenticator or any TOTP app, enter the verification code, and 2FA is enabled.",
      },
      {
        q: "I can't log in. What do I do?",
        a: "Use the 'Forgot Password' link on the login page. If you're locked out due to 2FA, contact support with your account email.",
      },
      {
        q: "How do I delete my account?",
        a: "Profile → Settings → Privacy → Delete Account. This is permanent and cannot be undone. Withdraw any cash balance before deleting.",
      },
    ],
  },
];

export function HelpCenter() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visible = SECTIONS.map((s) => ({
    ...s,
    articles: s.articles.filter(
      (a) =>
        !search ||
        a.q.toLowerCase().includes(search.toLowerCase()) ||
        a.a.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((s) => s.articles.length > 0);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-white">📖 Help Center</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--app-ink-3)" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search help articles..."
          className="w-full pl-9 pr-3 py-2.5 bg-(--app-surface) border border-(--app-line) rounded-lg text-(--app-ink) text-sm placeholder:text-(--app-ink-3) focus:outline-none focus:border-blue-500"
        />
      </div>

      {visible.map((sec) => (
        <div
          key={sec.title}
          className="rounded-xl border border-(--app-line) bg-(--app-surface) overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-(--app-line) flex items-center gap-2">
            <span className="text-lg">{sec.icon}</span>
            <p className="text-sm font-bold text-white">{sec.title}</p>
            <span className="ml-auto text-[10px] text-(--app-ink-3) tabular-nums">
              {sec.articles.length}
            </span>
          </div>
          {sec.articles.map((a) => {
            const key = `${sec.title}:${a.q}`;
            const isOpen = open.has(key);
            return (
              <div key={key} className="border-b border-(--app-line) last:border-b-0">
                <button
                  onClick={() => toggle(key)}
                  className="w-full text-left flex items-center gap-2 px-4 py-3"
                >
                  <span className="flex-1 text-sm font-semibold text-white">
                    {a.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-(--app-ink-3) transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                {isOpen && (
                  <p className="px-4 pb-3 text-xs text-(--app-ink-2) leading-relaxed">
                    {a.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
